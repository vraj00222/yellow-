import type { ApprovalStatus, Severity } from '../types';

const SEV_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function SeverityBadge({ severity }: { severity?: Severity | null }) {
  if (!severity) return null;
  return <span className={`sev sev--${severity}`}>{SEV_LABEL[severity]}</span>;
}

const AP_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  investigating: 'Investigating',
};

export function ApprovalChip({ status }: { status?: ApprovalStatus | null }) {
  if (!status) return null;
  return <span className={`apr apr--${status}`}>{AP_LABEL[status]}</span>;
}
