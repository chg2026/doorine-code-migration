"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";
import { getCurrentUser } from "../auth";
import { can } from "../permissions";
import { assertValidStoredUpload } from "../serverFileValidation";

const ALLOWED_TYPES = new Set(["insurance", "w9", "license", "other"]);

const TYPE_LABEL: Record<string, string> = {
  insurance: "Certificate of Insurance",
  w9: "W-9",
  license: "License",
  other: "Compliance document",
};

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

function actorName(u: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  id: string;
}) {
  return (
    `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || u.id
  );
}

async function loadOwnedContact(contactId: string, companyId: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.companyId !== companyId) {
    throw new Error("Contact not found");
  }
  return contact;
}

async function revalidateProjectsForContact(contactId: string, companyId: string) {
  const assignments = await prisma.contractorAssignment.findMany({
    where: { contactId, companyId },
    select: { project: { select: { code: true } } },
  });
  const codes = new Set<string>();
  for (const a of assignments) {
    if (a.project?.code) codes.add(a.project.code);
  }
  for (const code of codes) {
    revalidatePath(`/rehab/${code}/documents`);
    revalidatePath(`/rehab/${code}/activity`);
  }
}

export type UploadComplianceDocInput = {
  type: string;
  name: string;
  expiresAt?: string | null;
  fileKey?: string | null;
};

/**
 * Add a new compliance doc (COI / W-9 / License / Other) to a contact.
 * Writes an audit log entry tagged as `compliance.uploaded` so the activity
 * feed shows who uploaded it. Dynamic readers (project Documents tab,
 * contact profile) pick up the new row automatically.
 */
export async function uploadContractorComplianceDoc(
  contactId: string,
  data: UploadComplianceDocInput
) {
  const user = await requireUser();
  const allowed = await can(user, "documents", "edit");
  if (!allowed) throw new Error("Not authorized to upload compliance documents");

  const contact = await loadOwnedContact(contactId, user.companyId);

  const type = (data.type || "").trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) throw new Error("Invalid compliance document type");

  const name = data.name?.trim();
  if (!name) throw new Error("Document name required");

  let expiresAt: Date | null = null;
  if (data.expiresAt) {
    const parsed = new Date(data.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid expiry date");
    expiresAt = parsed;
  }
  // Insurance and license track expiry; W-9 doesn't. Don't force a date for w9.
  if ((type === "insurance" || type === "license") && !expiresAt) {
    throw new Error("Expiry date required for this document type");
  }

  await assertValidStoredUpload(data.fileKey);

  const doc = await prisma.contractorComplianceDoc.create({
    data: {
      contactId: contact.id,
      type,
      name,
      expiresAt,
      fileKey: data.fileKey ?? null,
      status: "Active",
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "compliance.uploaded",
      entity: "ContractorComplianceDoc",
      entityId: doc.id,
      message: `${actorName(user)} uploaded ${TYPE_LABEL[type]} "${name}" for ${contact.name}${
        expiresAt ? ` (expires ${expiresAt.toISOString().slice(0, 10)})` : ""
      }.`,
      meta: {
        type: "document",
        contactId: contact.id,
        contactName: contact.name,
        complianceDocId: doc.id,
        complianceType: type,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      },
    },
  });

  revalidatePath(`/contacts/${contact.id}`);
  revalidatePath(`/contacts`);
  await revalidateProjectsForContact(contact.id, user.companyId);

  return { id: doc.id };
}

export type RenewComplianceDocInput = {
  name?: string;
  expiresAt?: string | null;
  fileKey?: string | null;
};

/**
 * Renew an existing compliance doc in place: update file + expiry, reset
 * status to Active. Writes an audit log tagged `compliance.renewed`.
 *
 * Expiry is required for doc types that track expiry (insurance, license)
 * or for any doc that previously had an expiry on file.
 */
export async function renewContractorComplianceDoc(
  docId: string,
  data: RenewComplianceDocInput
) {
  const user = await requireUser();
  const allowed = await can(user, "documents", "edit");
  if (!allowed) throw new Error("Not authorized to renew compliance documents");

  const existing = await prisma.contractorComplianceDoc.findUnique({
    where: { id: docId },
    include: { contact: true },
  });
  if (!existing || existing.contact.companyId !== user.companyId) {
    throw new Error("Compliance document not found");
  }

  const expiryRequired =
    existing.type === "insurance" ||
    existing.type === "license" ||
    !!existing.expiresAt;

  let newExpiresAt: Date | null = existing.expiresAt;
  if (data.expiresAt) {
    const parsed = new Date(data.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid expiry date");
    newExpiresAt = parsed;
  } else if (expiryRequired) {
    throw new Error("New expiry date required");
  }

  const newName = data.name?.trim() || existing.name;
  const newFileKey = data.fileKey ?? existing.fileKey;

  await assertValidStoredUpload(data.fileKey);

  const previousExpiresAt = existing.expiresAt;

  // Snapshot the current state then update in a single transaction so a
  // partial failure cannot leave an orphaned version row.
  const [, updated] = await prisma.$transaction([
    prisma.contractorComplianceDocVersion.create({
      data: {
        docId: existing.id,
        name: existing.name,
        expiresAt: existing.expiresAt,
        fileKey: existing.fileKey,
      },
    }),
    prisma.contractorComplianceDoc.update({
      where: { id: existing.id },
      data: {
        name: newName,
        expiresAt: newExpiresAt,
        fileKey: newFileKey,
        status: "Active",
      },
    }),
  ]);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "compliance.renewed",
      entity: "ContractorComplianceDoc",
      entityId: updated.id,
      message: `${actorName(user)} renewed ${TYPE_LABEL[existing.type] ?? "compliance doc"} "${
        updated.name
      }" for ${existing.contact.name}${
        newExpiresAt
          ? ` — new expiry ${newExpiresAt.toISOString().slice(0, 10)}`
          : ""
      }.`,
      meta: {
        type: "document",
        contactId: existing.contactId,
        contactName: existing.contact.name,
        complianceDocId: updated.id,
        complianceType: existing.type,
        previousExpiresAt: previousExpiresAt ? previousExpiresAt.toISOString() : null,
        expiresAt: newExpiresAt ? newExpiresAt.toISOString() : null,
      },
    },
  });

  revalidatePath(`/contacts/${existing.contactId}`);
  revalidatePath(`/contacts`);
  await revalidateProjectsForContact(existing.contactId, user.companyId);

  return { id: updated.id };
}
