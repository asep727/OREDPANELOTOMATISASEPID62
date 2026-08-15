import AdminClient from "../admin/admin-client";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function OwnerPage() {
  return <AdminClient />;
}
