"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const AddProjectModal = dynamic(() => import("./AddProjectModal"), { ssr: false });

export default function AddProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-sm" onClick={() => setOpen(true)}>
        + New project
      </button>
      {open && <AddProjectModal onClose={() => setOpen(false)} />}
    </>
  );
}
