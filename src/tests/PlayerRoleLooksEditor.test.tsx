// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api } from '../lib/api.ts';
import { emptyRoleLook, LOOK_ROLES } from '../lib/roleLooks.ts';
import PlayerRoleLooksEditor from '../components/player/PlayerRoleLooksEditor.tsx';
vi.mock('../components/ui/PlayerAvatar.tsx',()=>({PlayerAvatar:()=> <span>Исходный портрет</span>}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const data=()=>({looks:LOOK_ROLES.map(emptyRoleLook),layers:[],portraitVersion:null});
it('keeps independent role drafts and saves only the selected role with its revision',async()=>{
  vi.spyOn(api,'getRoleLooks').mockResolvedValue(data());const save=vi.spyOn(api,'saveRoleLook').mockImplementation(async(role,look)=>({...look,role,revision:1}));
  render(<PlayerRoleLooksEditor playerId="p" nickname="Chagin" initialOpen/>);
  await screen.findByLabelText('Фраза');fireEvent.change(screen.getByLabelText('Фраза'),{target:{value:'Мирный текст'}});
  fireEvent.click(screen.getByRole('button',{name:/^Дон$/}));expect((screen.getByLabelText('Фраза') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Фраза'),{target:{value:'Донский текст'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить: Дон'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith('don',{phrase:'Донский текст',background:'noir',hatItemId:null,jacketItemId:null},0));
  fireEvent.click(screen.getByRole('button',{name:/^Мирный$/}));expect((screen.getByLabelText('Фраза') as HTMLInputElement).value).toBe('Мирный текст');
  expect((screen.getByLabelText('Головной убор') as HTMLSelectElement).disabled).toBe(true);
});
it('retains unsaved text after a failed save and explains revision conflicts',async()=>{
  vi.spyOn(api,'getRoleLooks').mockResolvedValue(data());vi.spyOn(api,'saveRoleLook').mockRejectedValue(new Error('look_revision_conflict'));
  render(<PlayerRoleLooksEditor playerId="p" nickname="Игрок" initialOpen/>);
  await screen.findByLabelText('Фраза');fireEvent.change(screen.getByLabelText('Фраза'),{target:{value:'Не потерять'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить: Мирный'}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('другом окне'));
  expect((screen.getByLabelText('Фраза') as HTMLInputElement).value).toBe('Не потерять');
});
