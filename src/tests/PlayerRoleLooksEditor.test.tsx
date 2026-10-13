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
  await waitFor(()=>expect(save).toHaveBeenCalledWith('don',{phrase:'Донский текст',background:'noir',hatItemId:null,jacketItemId:null,equippedItems:{}},0));
  fireEvent.click(screen.getByRole('button',{name:/^Мирный$/}));expect((screen.getByLabelText('Фраза') as HTMLInputElement).value).toBe('Мирный текст');
  expect((screen.getByRole('group',{name:'Головной убор'}) as HTMLFieldSetElement).disabled).toBe(true);
});
it('retains unsaved text after a failed save and explains revision conflicts',async()=>{
  vi.spyOn(api,'getRoleLooks').mockResolvedValue(data());vi.spyOn(api,'saveRoleLook').mockRejectedValue(new Error('look_revision_conflict'));
  render(<PlayerRoleLooksEditor playerId="p" nickname="Игрок" initialOpen/>);
  await screen.findByLabelText('Фраза');fireEvent.change(screen.getByLabelText('Фраза'),{target:{value:'Не потерять'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить: Мирный'}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('другом окне'));
  expect((screen.getByLabelText('Фраза') as HTMLInputElement).value).toBe('Не потерять');
});

it('previews inventory-owned garment and hat separately without changing the other slot',async()=>{
  vi.spyOn(api,'getRoleLooks').mockResolvedValue({
    looks:LOOK_ROLES.map(emptyRoleLook),portraitVersion:'approved-v1',layers:[
      {itemId:'hat-1',name:'Медный лист',slot:'portrait_hat',url:'/cosmetics/autumn-fedora-v1.svg',rarity:'rare'},
      {itemId:'jacket-1',name:'Багряный сюртук',slot:'portrait_jacket',url:'/cosmetics/autumn-jacket-v1.svg',rarity:'epic'},
    ],
  });
  const save=vi.spyOn(api,'saveRoleLook').mockImplementation(async(role,look)=>({...look,role,revision:1}));
  render(<PlayerRoleLooksEditor playerId="p" nickname="Денди" initialOpen/>);
  await screen.findByRole('group',{name:'Головной убор'});
  fireEvent.click(screen.getByRole('button',{name:/Медный лист/}));
  fireEvent.click(screen.getByRole('button',{name:/Багряный сюртук/}));
  expect(screen.getByRole('button',{name:/Медный лист/}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button',{name:/Багряный сюртук/}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('checkbox',{name:/Направляющие посадки/}));
  expect(document.querySelector('.role-portrait-guides')).not.toBeNull();
  fireEvent.click(screen.getByRole('checkbox',{name:/Направляющие посадки/}));
  expect(document.querySelector('.role-portrait-guides')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Только шляпа'}));
  expect(screen.getByRole('button',{name:'Только шляпа'}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByAltText('Головной убор')).toBeTruthy();
  expect(screen.queryByAltText('Пиджак')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Только одежда'}));
  expect(screen.getByAltText('Пиджак')).toBeTruthy();
  expect(screen.queryByAltText('Головной убор')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Весь образ'}));
  expect(screen.getByAltText('Головной убор')).toBeTruthy();
  expect(screen.getByAltText('Пиджак')).toBeTruthy();
  expect(screen.getByAltText('Пиджак').compareDocumentPosition(screen.getByAltText('Портрет игрока')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByAltText('Портрет игрока').compareDocumentPosition(screen.getByAltText('Головной убор')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Сохранить: Мирный'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith('civilian',expect.objectContaining({hatItemId:'hat-1',jacketItemId:'jacket-1'}),0));
});

it('exposes new owned slots independently without altering old hat or jacket slots',async()=>{
  vi.spyOn(api,'getRoleLooks').mockResolvedValue({
    looks:LOOK_ROLES.map(emptyRoleLook),portraitVersion:'approved-v1',layers:[
      {itemId:'shirt-1',name:'Тестовая рубашка',slot:'portrait_shirt',url:'/cosmetics/test-shirt.svg',rarity:'common'},
      {itemId:'hat-1',name:'Медный лист',slot:'portrait_hat',url:'/cosmetics/autumn-fedora-v1.svg',rarity:'rare'},
      {itemId:'jacket-1',name:'Багряный пиджак',slot:'portrait_jacket',url:'/cosmetics/autumn-jacket-v1.svg',rarity:'rare'},
    ],
  });
  const save=vi.spyOn(api,'saveRoleLook').mockImplementation(async(role,look)=>({...look,role,revision:1}));
  render(<PlayerRoleLooksEditor playerId="p" nickname="Денди" initialOpen/>);
  await screen.findByRole('group',{name:'Рубашка / основа одежды'});
  fireEvent.click(screen.getByRole('button',{name:/Тестовая рубашка/}));
  fireEvent.click(screen.getByRole('button',{name:/Медный лист/}));
  expect(screen.getByAltText('Рубашка / основа одежды')).toBeTruthy();
  expect(screen.getByAltText('Головной убор')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Сохранить: Мирный'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith('civilian',expect.objectContaining({
    hatItemId:'hat-1',jacketItemId:null,equippedItems:{portrait_hat:'hat-1',portrait_shirt:'shirt-1'},
  }),0));
  fireEvent.click(screen.getByRole('button',{name:/^Дон$/}));
  expect(screen.getByRole('button',{name:/Тестовая рубашка/}).getAttribute('aria-pressed')).toBe('false');
});
