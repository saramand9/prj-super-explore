import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { runCommand } from './file-commands';
import type { CommandItem, MainMenu } from './main-menu-model';

function useMenuControls(menuCount: number) {
  const [open, setOpen] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (open === null) return;
    const frame = requestAnimationFrame(() =>
      root.current?.querySelector<HTMLButtonElement>('[role="menu"] button:not(:disabled)')?.focus(),
    );
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const blur = () => setOpen(null);
    window.addEventListener('pointerdown', outside);
    window.addEventListener('blur', blur);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('blur', blur);
    };
  }, [open]);
  const close = (restore = true) => {
    setOpen(null);
    if (restore) triggers.current[current]?.focus();
  };
  const navigate = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      setOpen(null);
      return;
    }
    event.stopPropagation();
    if (event.key === 'Tab') {
      close(false);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + menuCount) % menuCount;
      setCurrent(next);
      triggers.current[next]?.focus();
      if (open !== null) setOpen(next);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (open === null) {
      setOpen(current);
      return;
    }
    const items = [
      ...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not(:disabled)') ?? []),
    ];
    const index = items.findIndex((item) => item === document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
  };
  return { root, triggers, open, current, setCurrent, setOpen, close, navigate };
}

export function CommandMenus({ menus }: { menus: MainMenu[] }) {
  const { root, triggers, open, current, setCurrent, setOpen, close, navigate } = useMenuControls(
    menus.length,
  );
  return (
    <div ref={root} className="command-menus" role="menubar" aria-label="主菜单" onKeyDown={navigate}>
      {menus.map((menu, index) => (
        <div key={menu.id} className="command-menus__anchor">
          <button
            ref={(element) => {
              triggers.current[index] = element;
            }}
            role="menuitem"
            className="command-menus__trigger"
            aria-haspopup="menu"
            aria-expanded={open === index}
            aria-controls={`main-menu-${menu.id}`}
            tabIndex={current === index ? 0 : -1}
            onFocus={() => setCurrent(index)}
            onPointerEnter={() => {
              if (open !== null) {
                setOpen(index);
                setCurrent(index);
              }
            }}
            onClick={() => {
              setCurrent(index);
              setOpen(open === index ? null : index);
            }}
          >
            {menu.label}
          </button>
          {open === index && (
            <div
              id={`main-menu-${menu.id}`}
              role="menu"
              aria-label={menu.label}
              className="command-menu solid-elevated-surface"
            >
              {menu.groups.map((group) => (
                <div className="command-menu__group" role="group" aria-label={group.label} key={group.label}>
                  <div className="command-menu__caption" aria-hidden="true">
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <MenuCommand
                      key={item.id}
                      item={item}
                      onChoose={() => {
                        close();
                        void runCommand(item.action);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MenuCommand({ item, onChoose }: { item: CommandItem; onChoose: () => void }) {
  const Icon = item.icon;
  return (
    <button
      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-label={item.label}
      aria-checked={item.checked}
      aria-disabled={!!item.disabled}
      disabled={item.disabled}
      tabIndex={-1}
      className={`command-menu__item${item.danger ? ' command-menu__item--danger' : ''}`}
      title={item.description}
      onClick={onChoose}
    >
      <Icon className="command-menu__icon" size={16} strokeWidth={1.7} aria-hidden="true" />
      <span className="command-menu__text">
        <span>{item.label}</span>
        {item.description && <small>{item.description}</small>}
      </span>
      <span className="command-menu__meta">
        {item.checked && <Check size={15} className="command-menu__check" aria-hidden="true" />}
        {item.shortcut && <kbd aria-hidden="true">{item.shortcut}</kbd>}
      </span>
    </button>
  );
}
