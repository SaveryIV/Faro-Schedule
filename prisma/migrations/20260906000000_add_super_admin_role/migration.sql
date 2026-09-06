-- Add the SUPER_ADMIN value to the Role enum.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
