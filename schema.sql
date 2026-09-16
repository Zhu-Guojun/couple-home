-- ============================================================
-- 情侣小窝：Supabase 数据库初始化
-- 使用方法：Supabase → SQL Editor → New query → 粘贴 → Run
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.couple_rooms (
  id uuid primary key default gen_random_uuid(),
  room_token text unique not null check (char_length(room_token) >= 24),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.couple_rooms enable row level security;

-- 不开放普通表的匿名读写，所有操作均通过下面三个 RPC 完成。
revoke all on table public.couple_rooms from anon, authenticated;

drop function if exists public.create_couple_room(text, jsonb);
drop function if exists public.get_couple_room(text);
drop function if exists public.save_couple_room(text, jsonb);

create or replace function public.create_couple_room(
  p_token text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.couple_rooms;
begin
  insert into public.couple_rooms(room_token, data)
  values (p_token, p_data)
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'data', v_row.data,
    'updated_at', v_row.updated_at
  );
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', '房间密钥重复，请重新创建');
end;
$$;

grant execute on function public.create_couple_room(text, jsonb) to anon, authenticated;

create or replace function public.get_couple_room(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.couple_rooms;
begin
  select * into v_row
  from public.couple_rooms
  where room_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'error', '房间不存在或链接无效');
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', v_row.data,
    'updated_at', v_row.updated_at
  );
end;
$$;

grant execute on function public.get_couple_room(text) to anon, authenticated;

create or replace function public.save_couple_room(
  p_token text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.couple_rooms;
begin
  update public.couple_rooms
  set data = p_data,
      updated_at = now()
  where room_token = p_token
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'error', '房间不存在或链接无效');
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', v_row.data,
    'updated_at', v_row.updated_at
  );
end;
$$;

grant execute on function public.save_couple_room(text, jsonb) to anon, authenticated;
