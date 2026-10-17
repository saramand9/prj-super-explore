import { PanelsTopLeft } from 'lucide-react';
import { CommandMenus } from './command-menus';
import { useFileCommandContext } from './file-commands';
import { useFolderDialog } from './folder-name-dialog';
import { editMenu, fileMenu, helpMenu, viewMenu } from './main-menu-model';
import { AppearanceControls } from './appearance-controls';
import { UpdateCenter } from './update-center';
import '../styles/command-bar.css';

export function MenuBar() {
  const context = useFileCommandContext();
  const folder = useFolderDialog();
  const menus = [fileMenu(context, folder.open), editMenu(context), viewMenu(context), helpMenu()];
  return (
    <>
      <header className="app-menubar">
        <div className="app-menubar__brand" aria-label="Explore">
          <PanelsTopLeft size={17} strokeWidth={1.7} />
          <span>Explore</span>
        </div>
        <CommandMenus menus={menus} />
        <div className="app-menubar__settings">
          <UpdateCenter />
          <AppearanceControls />
        </div>
      </header>
      {folder.dialog}
    </>
  );
}
