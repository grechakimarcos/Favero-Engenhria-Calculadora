-- =============================================
-- Fávero Engenharia ERP — Supabase Schema Setup
-- Execute este SQL no Supabase Dashboard:
-- Dashboard > SQL Editor > New Query
-- =============================================

-- 1. Tabela: settings (parâmetros financeiros por usuário)
CREATE TABLE IF NOT EXISTS public.settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  meta_mensal       numeric DEFAULT 30000,
  imposto_simples   numeric DEFAULT 0.06,
  multiplicador_minimo numeric DEFAULT 1.80,
  updated_at  timestamptz DEFAULT now()
);

-- 2. Tabela: collaborators
CREATE TABLE IF NOT EXISTS public.collaborators (
  id            text NOT NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome          text,
  cargo         text,
  custo_mensal  numeric DEFAULT 0,
  horas_mensais numeric DEFAULT 160,
  produtividade numeric DEFAULT 100,
  PRIMARY KEY (id, user_id)
);

-- 3. Tabela: indirect_costs
CREATE TABLE IF NOT EXISTS public.indirect_costs (
  id      text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome    text,
  valor   numeric DEFAULT 0,
  PRIMARY KEY (id, user_id)
);

-- 4. Tabela: project_history
CREATE TABLE IF NOT EXISTS public.project_history (
  id       text NOT NULL,
  user_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  saved_at timestamptz DEFAULT now(),
  data     jsonb,
  PRIMARY KEY (id, user_id)
);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE public.settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborators   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indirect_costs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_history ENABLE ROW LEVEL SECURITY;

-- Policies: settings
CREATE POLICY "Users can view own settings"   ON public.settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own settings" ON public.settings FOR DELETE USING (auth.uid() = user_id);

-- Policies: collaborators
CREATE POLICY "Users can view own collaborators"   ON public.collaborators FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own collaborators" ON public.collaborators FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own collaborators" ON public.collaborators FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own collaborators" ON public.collaborators FOR DELETE USING (auth.uid() = user_id);

-- Policies: indirect_costs
CREATE POLICY "Users can view own indirect costs"   ON public.indirect_costs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own indirect costs" ON public.indirect_costs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own indirect costs" ON public.indirect_costs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own indirect costs" ON public.indirect_costs FOR DELETE USING (auth.uid() = user_id);

-- Policies: project_history
CREATE POLICY "Users can view own history"   ON public.project_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON public.project_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own history" ON public.project_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own history" ON public.project_history FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- PRONTO! Depois crie seu usuário em:
-- Supabase Dashboard > Authentication > Users > Add User
-- =============================================
