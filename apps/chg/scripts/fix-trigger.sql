-- Fix the handle_new_user trigger to be resilient to NULL metadata
-- Run this in the Supabase SQL Editor

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'account_id' IS NOT NULL THEN
    INSERT INTO user_profiles (id, email, full_name, account_id, role_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      (NEW.raw_user_meta_data->>'account_id')::UUID,
      NULLIF(NEW.raw_user_meta_data->>'role_id', '')::UUID
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
