import { Alert, Modal, Spin, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { diffVersionWithCurrent, type ArtifactVersion } from '../../api/artifacts';
import { extractErrorMessage } from '../../api/client';
import { VersionDiffView } from './VersionDiffView';

interface CompareVersionModalProps {
  open: boolean;
  artifactId: number;
  baseVersion: ArtifactVersion | null;
  currentVersionNumber?: number;
  onClose: () => void;
}

/** Diffs a selected older version (base) against the current version, shown read-only. */
export function CompareVersionModal({
  open,
  artifactId,
  baseVersion,
  currentVersionNumber,
  onClose,
}: Readonly<CompareVersionModalProps>) {
  const baseId = baseVersion?.id ?? null;

  const { data: diff, isLoading, error } = useQuery({
    queryKey: ['artifacts', artifactId, 'version-diff', baseId],
    queryFn: () => diffVersionWithCurrent(artifactId, baseId as number),
    enabled: open && baseId != null,
  });

  return (
    <Modal
      open={open}
      title="Compare with current version"
      width={640}
      footer={null}
      onCancel={onClose}
      destroyOnClose
    >
      {baseVersion && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          Changes from <Tag>v{baseVersion.versionNumber}</Tag> to{' '}
          <Tag color="blue">v{currentVersionNumber ?? '?'} · current</Tag>. The current version is the new side:
          "Added" means files present in current but not in v{baseVersion.versionNumber}.
        </Typography.Paragraph>
      )}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : error ? (
        <Alert type="error" showIcon message={extractErrorMessage(error, 'Failed to compare versions')} />
      ) : diff ? (
        <VersionDiffView diff={diff} />
      ) : null}
    </Modal>
  );
}
