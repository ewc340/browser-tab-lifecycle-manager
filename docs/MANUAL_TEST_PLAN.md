# Manual test plan

PRD §30.2 checklist. Record results after each release that touches sweep, storage, or manifest.

**Last run:** _not yet recorded_  
**Extension version:** _pending_  
**Chrome version:** _pending_

## Checklist

- [ ] Side panel opens from the toolbar
- [ ] Tab creation appears immediately in the list
- [ ] Tab closure disappears immediately from the list
- [ ] Switching tabs updates activity timestamps
- [ ] Lock context menu works
- [ ] Keyboard shortcut (Alt+Shift+T) opens/toggles the panel
- [ ] Manual sleep works from the tab row
- [ ] Automatic sleep works with a temporarily short threshold (dev build)
- [ ] Pending closure appears with countdown
- [ ] Closure is canceled by activating the tab
- [ ] Closure is canceled by locking the tab
- [ ] Automatic closure creates a recovery item
- [ ] Restore works after the original window was closed
- [ ] Browser restart preserves settings and activity
- [ ] Extension reload does not duplicate context-menu items
- [ ] Browser sleep/wake does not duplicate closure events
- [ ] Update path: install N, create locks + pending closures, load N+1 — data survives, pending closures cleared

## Automated smoke (run before manual pass)

```bash
npm run build
npm run smoke
npm run smoke:lifecycle
npm run smoke:recovery
```
