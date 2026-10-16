import { WorkspaceSwitcher } from './workspace-switcher';

interface SpaceSearchProps {
  open: boolean;
  onClose: () => void;
}

export function SpaceSearch({ open, onClose }: SpaceSearchProps) {
  return <WorkspaceSwitcher open={open} onClose={onClose} variant="modal" />;
}
