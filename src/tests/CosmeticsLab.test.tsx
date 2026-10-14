// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CosmeticsLab from '../components/player/CosmeticsLab.tsx';
import PlayerRoleLooksEditor from '../components/player/PlayerRoleLooksEditor.tsx';
import { api } from '../lib/api.ts';
import { emptyRoleLook, LOOK_ROLES } from '../lib/roleLooks.ts';

beforeEach(()=>{localStorage.clear();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

it('preserves the shirt and replacement jacket after reload while the frozen look and other roles stay independent', async()=>{
  const view=render(<CosmeticsLab/>);
  const editor=within(view.container.querySelector('.role-looks-editor')! as HTMLElement);
  await editor.findByLabelText('Фраза');
  fireEvent.click(editor.getByRole('button',{name:'Дон'}));
  fireEvent.click(editor.getByRole('button',{name:/Багряный пиджак/}));
  fireEvent.click(editor.getByRole('button',{name:'Сохранить: Дон'}));
  await editor.findByRole('status');
  fireEvent.click(within(screen.getByRole('group',{name:'Роль на трансляции'})).getByRole('button',{name:'Дон'}));
  fireEvent.click(screen.getByRole('button',{name:'Зафиксировать образ для тестовой игры'}));
  fireEvent.click(editor.getByRole('button',{name:/Чёрный пиджак/}));
  fireEvent.click(editor.getByRole('button',{name:'Сохранить: Дон'}));
  await waitFor(()=>expect(within(view.container.querySelector('.cosmetics-lab-character-view:not([hidden]) [data-testid=lab-broadcast-card]')! as HTMLElement).getByRole('img',{name:'Пиджак'}).getAttribute('data-asset-url')).toContain('jacket-black-v3'));
  const frozen=within(view.container.querySelector('.cosmetics-lab-character-view:not([hidden]) [data-testid=lab-frozen-card]')! as HTMLElement);
  expect(frozen.getByRole('img',{name:'Пиджак'}).getAttribute('data-asset-url')).toContain('jacket-burgundy-v3');
  expect(frozen.getByRole('img',{name:'Рубашка / основа одежды'})).toBeTruthy();
  expect(frozen.getByAltText('Портрет игрока').getAttribute('src')).toContain('base-v2.png');
  view.unmount();
  const reload=render(<CosmeticsLab/>);
  const reloaded=within(reload.container.querySelector('.role-looks-editor')! as HTMLElement);
  await reloaded.findByLabelText('Фраза');
  expect(reloaded.getByRole('button',{name:/Чёрный пиджак/}).getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(reloaded.getByRole('button',{name:'Дон'}));
  expect(reloaded.getByRole('button',{name:/Чёрный пиджак/}).getAttribute('aria-pressed')).toBe('true');
  expect(reloaded.getByRole('button',{name:/Белая рубашка/}).getAttribute('aria-pressed')).toBe('true');
});

it('opens the owner fit check in the existing editor and never saves its fixture through the production API',async()=>{
  vi.spyOn(api,'getRoleLooks').mockResolvedValue({looks:LOOK_ROLES.map(emptyRoleLook),portraitVersion:null,layers:[],canApprovePortrait:true});
  const save=vi.spyOn(api,'saveRoleLook');
  render(<PlayerRoleLooksEditor playerId="owner" nickname="Владелец" initialOpen/>);
  await screen.findByLabelText('Фраза');
  fireEvent.click(screen.getByText('Примерка на трёх персонажах'));
  const pilot=await screen.findByRole('region',{name:'Примерка гардероба Денди'});
  const editor=within(pilot.querySelector('.role-looks-editor')! as HTMLElement);
  await editor.findByLabelText('Фраза');
  fireEvent.click(editor.getByRole('button',{name:/Чёрный пиджак/}));
  fireEvent.click(editor.getByRole('button',{name:'Сохранить: Мирный'}));
  await editor.findByRole('status');
  expect(save).not.toHaveBeenCalled();
  expect(api.getRoleLooks).toHaveBeenCalledTimes(1);
});

it('retains character drafts and fitting when switching, and scopes role persistence to the selected person',async()=>{
  const view=render(<CosmeticsLab/>);
  const active=()=>within(view.container.querySelector('.cosmetics-lab-character-view:not([hidden])')! as HTMLElement);
  await active().findByLabelText('Фраза');
  fireEvent.change(active().getByLabelText('Фраза'),{target:{value:'Черновик Денди'}});
  const selector=within(screen.getByRole('group',{name:'Персонаж примерки'}));
  fireEvent.click(selector.getByRole('button',{name:'Фандорин'}));
  await active().findByLabelText('Фраза');
  expect((active().getByLabelText('Фраза') as HTMLInputElement).value).toBe('');
  fireEvent.click(within(active().getByRole('group',{name:'Образ по роли'})).getByRole('button',{name:'Дон'}));
  fireEvent.change(active().getByLabelText('Фраза'),{target:{value:'Образ Фандорина'}});
  fireEvent.click(within(view.container.querySelector('.cosmetics-lab-character-view:not([hidden]) .role-looks-editor')! as HTMLElement).getByRole('button',{name:/Чёрный пиджак/}));
  fireEvent.click(active().getByRole('button',{name:'Сохранить: Дон'}));
  await waitFor(()=>expect(localStorage.getItem('2la-cosmetics-lab-v3:fandorin')).toContain('Образ Фандорина'));
  fireEvent.click(active().getByText('Посадка одежды · Фандорин'));
  fireEvent.change(active().getByLabelText('Талия'),{target:{value:'0.24'}});
  fireEvent.click(active().getByRole('button',{name:'Сохранить посадку'}));
  fireEvent.click(selector.getByRole('button',{name:'Денди'}));
  expect((active().getByLabelText('Фраза') as HTMLInputElement).value).toBe('Черновик Денди');
  expect(localStorage.getItem('2la-cosmetics-lab-v2')).toBeNull();
  fireEvent.click(selector.getByRole('button',{name:'Фандорин'}));
  expect((active().getByLabelText('Талия') as HTMLInputElement).value).toBe('0.24');
  expect(localStorage.getItem('2la-cosmetics-lab-v3:fandorin')).toContain('Образ Фандорина');
});
