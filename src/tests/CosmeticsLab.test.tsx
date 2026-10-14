// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CosmeticsLab from '../components/player/CosmeticsLab.tsx';
import PlayerRoleLooksEditor from '../components/player/PlayerRoleLooksEditor.tsx';
import { api } from '../lib/api.ts';
import { emptyRoleLook, LOOK_ROLES } from '../lib/roleLooks.ts';

beforeEach(()=>localStorage.clear());
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
  await waitFor(()=>expect(within(screen.getByTestId('lab-broadcast-card')).getByAltText('Пиджак').getAttribute('src')).toContain('jacket-black-v2'));
  const frozen=within(screen.getByTestId('lab-frozen-card'));
  expect(frozen.getByAltText('Пиджак').getAttribute('src')).toContain('jacket-burgundy-v2');
  expect(frozen.getByAltText('Рубашка / основа одежды')).toBeTruthy();
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
  fireEvent.click(screen.getByText('Примерка на Денди'));
  const pilot=await screen.findByRole('region',{name:'Примерка гардероба Денди'});
  const editor=within(pilot.querySelector('.role-looks-editor')! as HTMLElement);
  await editor.findByLabelText('Фраза');
  fireEvent.click(editor.getByRole('button',{name:/Чёрный пиджак/}));
  fireEvent.click(editor.getByRole('button',{name:'Сохранить: Мирный'}));
  await editor.findByRole('status');
  expect(save).not.toHaveBeenCalled();
  expect(api.getRoleLooks).toHaveBeenCalledTimes(1);
});
