// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DraftSet, DraftWearableItem } from '../lib/roleLooks.ts';
import CosmeticSetStudio, { type CosmeticSetStudioClient } from '../components/player/CosmeticSetStudio.tsx';
import WardrobeSetGallery, { tryOnOwnedSet } from '../components/player/WardrobeSetGallery.tsx';
import { emptyRoleLook, type WardrobeSet } from '../lib/roleLooks.ts';

afterEach(()=>{cleanup();vi.restoreAllMocks();});
const seed:DraftSet={
  id:'set-one',name:'Сет №1 — черновик',rarity:'common',seasonId:null,published:false,items:[],
};
const items:DraftWearableItem[]=[
  {id:'hat',name:'Тестовая шляпа',slot:'portrait_hat',rarity:'rare',seasonId:null,published:false,draft:true,url:'/cosmetics/autumn-fedora-v1.svg'},
  {id:'jacket',name:'Тестовая одежда',slot:'portrait_jacket',rarity:'epic',seasonId:null,published:false,draft:true,url:'/cosmetics/autumn-jacket-v1.svg'},
];
it('author can preview independent draft components and explicitly save without publishing',async()=>{
  let sets=[seed];
  const save=vi.fn(async(setId:string,itemIds:string[])=>{
    sets=sets.map(s=>s.id===setId?{...s,items:items.filter(i=>itemIds.includes(i.id)).map(i=>({id:i.id,name:i.name,slot:i.slot,rarity:i.rarity,published:false}))}:s);
    return {setId,items:[]};
  });
  const client={
    getCosmeticDraftSets:async()=>sets,
    getCosmeticDraftItems:async()=>items,
    saveCosmeticDraftSetItems:save,
    createCosmeticDraftSet:vi.fn(async()=>{throw new Error('not-needed');}),
  } as CosmeticSetStudioClient;
  render(<CosmeticSetStudio client={client} portraitUrl="/cosmetics/lab-portrait.svg" initialOpen allowCreate={false}/>);
  await screen.findByRole('button',{name:/Тестовая шляпа/});
  fireEvent.click(screen.getByRole('button',{name:/Тестовая шляпа/}));
  fireEvent.click(screen.getByRole('button',{name:/Тестовая одежда/}));
  expect(screen.getByAltText('Головной убор')).toBeTruthy();
  expect(screen.getByAltText('Пиджак')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Сохранить состав черновика'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith('set-one',['jacket','hat']));
  expect(await screen.findByRole('status')).toHaveProperty('textContent',expect.stringContaining('Черновик'));
  expect(sets[0].published).toBe(false);
});
it('try-on merges only owned released pieces, keeping slots from other sets',()=>{
  const look={...emptyRoleLook('don'),hatItemId:'my-hat',equippedItems:{portrait_hat:'my-hat',portrait_shirt:'my-shirt'}};
  const set:WardrobeSet={id:'s',name:'Коллекция',rarity:'rare',items:[
    {itemId:'new-hat',name:'Hat',slot:'portrait_hat',rarity:'rare',url:'/hat.png',owned:false},
    {itemId:'coat',name:'Jacket',slot:'portrait_jacket',rarity:'rare',url:'/coat.png',owned:true},
  ]};
  const updated=tryOnOwnedSet(look,set,[
    {itemId:'coat',name:'Jacket',slot:'portrait_jacket',rarity:'rare',url:'/coat.png'},
    {itemId:'my-hat',name:'Old hat',slot:'portrait_hat',rarity:'rare',url:'/old.png'},
  ]);
  expect(updated).toEqual({portrait_hat:'my-hat',portrait_shirt:'my-shirt',portrait_jacket:'coat'});
  const onTrySet=vi.fn();
  render(<WardrobeSetGallery sets={[set]} layers={[
    {itemId:'coat',name:'Jacket',slot:'portrait_jacket',rarity:'rare',url:'/coat.png'},
  ]} look={look} disabled={false} onTrySet={onTrySet} onTryItem={vi.fn()}/>);
  fireEvent.click(screen.getByText('Коллекция'));
  expect(screen.getByRole('button',{name:'Нет в инвентаре'})).toHaveProperty('disabled',true);
  fireEvent.click(screen.getByRole('button',{name:'Примерить доступные: 1 из 2'}));
  expect(onTrySet).toHaveBeenCalledWith(set);
});
