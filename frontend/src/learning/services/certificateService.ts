import apiService from "./apiService";

export interface Certificate {
  id: string;
  courseId: string;
  certificateNumber: string;
  credentialUrl?: string | null;
  issuedAt?: string | null;
  courseTitle: string;
  userName: string;
}

const str = (v: any, d = ""): string => (v == null ? d : String(v));

const map = (c: any): Certificate => ({
  id: str(c.id),
  courseId: str(c.course_id),
  certificateNumber: str(c.certificate_number),
  credentialUrl: c.credential_url ?? null,
  issuedAt: c.issued_at ?? null,
  courseTitle: str(c.course_title, "Course"),
  userName: str(c.user_name),
});

/** Certificates for the authenticated user. */
export const getCertificates = async (): Promise<Certificate[]> => {
  const res = await apiService.get<any>("/getCertificates");
  const arr = res?.data ?? res ?? [];
  return (Array.isArray(arr) ? arr : []).map(map);
};
