import type { IsoDate } from "../dates";
import type { GateScanMethod, GateScanResult, GuestDocumentType, GuestPassStatus } from "../enums";
import type { IsoDateTime, PlayerSummary } from "./common";

export interface GuestPassItem {
  id: string;
  guestName: string;
  documentType: GuestDocumentType;
  /** Masked, e.g. ***.456.789-**. */
  documentMasked: string;
  visitDate: IsoDate;
  status: GuestPassStatus;
  usedAt: IsoDateTime | null;
  booking: { id: string; courtName: string; startTime: string } | null;
  /** Signed QR token; present while the pass can still be used. */
  token: string | null;
  createdAt: IsoDateTime;
}

export interface GatePassView {
  id: string;
  guestName: string;
  documentType: GuestDocumentType;
  /** Full document, formatted (gate only). */
  document: string;
  visitDate: IsoDate;
  status: GuestPassStatus;
  usedAt: IsoDateTime | null;
  host: Pick<PlayerSummary, "id" | "name" | "membershipId" | "photoUrl">;
}

export interface GateScanResponse {
  result: GateScanResult;
  accepted: boolean;
  /** pt-BR headline for the full-screen result. */
  message: string;
  scannedAt: IsoDateTime;
  pass: GatePassView | null;
}

export interface GateScanLogItem {
  id: string;
  result: GateScanResult;
  method: GateScanMethod;
  scannedAt: IsoDateTime;
  guestName: string | null;
  hostName: string | null;
  scannedBy: string;
}

export interface HostGuestStats {
  host: PlayerSummary;
  passes: number;
  visits: number;
  lastVisit: IsoDate | null;
  suspended: boolean;
  suspendedReason: string | null;
}

export interface DocumentGuestStats {
  documentType: GuestDocumentType;
  documentMasked: string;
  guestName: string;
  passes: number;
  visits: number;
  hosts: string[];
  lastVisit: IsoDate | null;
  blocked: boolean;
  /** Any pass with this document, used to block it without exposing the number. */
  samplePassId: string;
}

export interface GuestBlockItem {
  id: string;
  documentType: GuestDocumentType;
  documentMasked: string;
  reason: string | null;
  blockedBy: string;
  createdAt: IsoDateTime;
}

export interface AdminGuestPassItem extends Omit<GuestPassItem, "token"> {
  host: Pick<PlayerSummary, "id" | "name" | "membershipId">;
}

export interface MembershipImportResult {
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
}

export interface AdminMemberItem {
  player: PlayerSummary;
  isActive: boolean;
  guestPassesSuspended: boolean;
  guestPassesSuspendedReason: string | null;
}
