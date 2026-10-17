import { UPDATE_CHANNELS } from '@explore/shared';
import { ipc } from '../framework/bridge/ipc-client';
import { reportError } from '../framework/diagnostics';
import { useLayoutStore } from '../framework/store/layout-store';
import { useSpaceStore } from '../plugins/file-explorer/space-store';

/** Unlike ordinary close, an update never offers to discard unsaved state. */
export async function saveBeforeUpdate(requestId: number): Promise<void> {
  let allow = false;
  try {
    const spaces = useSpaceStore.getState();
    const preferences = useLayoutStore.getState();
    if (spaces.loaded && !spaces.restoring && preferences.preferencesLoaded) {
      const saved = await Promise.all([spaces.saveCurrentSpace(), preferences.savePreferences()]);
      allow = saved.every(Boolean);
    }
  } catch (error) {
    reportError('update-save', error);
  }
  try {
    await ipc.invoke(UPDATE_CHANNELS.resolveSave, { requestId, allow });
  } catch (error) {
    reportError('update-save-response', error);
  }
}
