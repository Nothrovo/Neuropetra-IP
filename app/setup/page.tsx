"use client";
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
export default function SetupPage() {
 const [error,setError]=useState('');const [pending,setPending]=useState(false);const [complete,setComplete]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');
  const formElement=event.currentTarget;const form=new FormData(formElement);
  if(form.get('password')!==form.get('confirmation')){setError('Passwords do not match');return;}
  setPending(true);
  try {
   const response=await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:form.get('token'),username:form.get('username'),password:form.get('password')})});
   if(!response.ok){const data=await response.json();throw new Error(data.error ?? 'Setup failed');}
   formElement.reset();setComplete(true);
  }catch(reason){setError(reason instanceof Error?reason.message:'Setup failed');}
  finally{setPending(false);}
 }
 if(complete)return <main className="mx-auto max-w-md px-6 py-16"><h1 className="text-2xl">Administrator created</h1><Link href="/login" className="mt-6 block underline">Sign in</Link></main>;
 return <main className="mx-auto max-w-md px-6 py-16 text-zinc-100">
  <h1 className="text-2xl font-semibold">Set up administrator</h1>
  <p className="mt-2 text-sm text-zinc-400">First run only. Ask the local operator for a short-lived bootstrap token. Setup stays closed after installation.</p>
  <form onSubmit={submit} className="mt-8 space-y-5">
   <div><label htmlFor="token" className="block text-sm">Bootstrap token</label><input id="token" name="token" type="password" autoComplete="off" required minLength={43} maxLength={43} className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-3" /></div>
   <div><label htmlFor="username" className="block text-sm">Username</label><input id="username" name="username" autoComplete="username" required minLength={3} maxLength={64} pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}" className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-3" /></div>
   <p id="password-policy" className="text-sm text-zinc-400">Use 15–128 characters. Spaces and Unicode are welcome.</p>
   <div><label htmlFor="password" className="block text-sm">Password</label><input id="password" name="password" type="password" autoComplete="new-password" aria-describedby="password-policy" required minLength={15} maxLength={128} className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-3" /></div>
   <div><label htmlFor="confirmation" className="block text-sm">Confirm password</label><input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={15} maxLength={128} className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-3" /></div>
   {error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
   <button disabled={pending} className="w-full rounded bg-zinc-100 p-3 text-zinc-950 disabled:opacity-50">{pending?'Creating account…':'Create administrator'}</button>
  </form><Link href="/login" className="mt-6 block text-sm underline">Back to sign in</Link>
 </main>;
}
