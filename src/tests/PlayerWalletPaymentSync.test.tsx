/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PlayerWalletHub from '../components/player/PlayerWalletHub.tsx';
const json=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
afterEach(()=>{cleanup();vi.unstubAllGlobals();window.history.replaceState({},'','/');});
it('updates both the payment detail and wallet debt after applying a gifted evening',async()=>{
 let gifted=false;
 const fetch=vi.fn(async(input:string,init?:RequestInit)=>{
  if(init?.method==='POST'){gifted=true;return json({ok:true});}
  if(input!=='/api/player/payments')throw Error('Unexpected URL '+input);
  return json({summary:{historical_debt:gifted?0:400,amount_paid:0},free_evening_credits:gifted?0:1,current:[{participant_id:'self',evening_id:'e',title:'Мой вечер',starts_at:null,venue:null,amount_due:gifted?0:400,amount_paid:0,outstanding:gifted?0:400,payment_status:gifted?'waived':'unpaid'}],history:[]});
 });
 vi.stubGlobal('fetch',fetch);
 render(<PlayerWalletHub data={{player:{id:'self'}} as any} tokenBalance={10} onBalanceChange={()=>{}} />);
 const button=await screen.findByRole('button',{name:/Использовать бесплатный вечер/});
 const summary=screen.getByText('Долг').parentElement!;
 await waitFor(()=>expect(summary.textContent).toContain('400 ₽'));
 fireEvent.click(button);
 await waitFor(()=>expect(summary.textContent).toContain('0 ₽'));
 expect(await screen.findByText('Бесплатно',{exact:true})).toBeTruthy();
 expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});
