-- =============================================
-- Fávero Engenharia ERP — Supabase RBAC & Profiles
-- Execute este SQL no Supabase Dashboard para habilitar 
-- a gestão de usuários e papéis (roles).
-- =============================================

-- 1. Criação da tabela de Perfis
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nome_completo text,
  telefone text,
  empresa text,
  cargo text,
  status text DEFAULT 'ativo', -- 'ativo', 'inativo'
  role text DEFAULT 'visitante', -- 'admin', 'engenheiro', 'financeiro', 'comercial', 'gestor', 'visitante'
  must_change_password boolean DEFAULT true,
  password_changed_at timestamptz,
  last_login_at timestamptz,
  failed_login_attempts integer DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- (Opcional) Adiciona as colunas se a tabela já existir (idempotente)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS failed_login_attempts integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- 2. Trigger para criar perfil automaticamente quando um usuário se cadastra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, nome_completo, role, must_change_password)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    -- IMPORTANTE: role padrão = 'visitante' para segurança.
    -- Após criar um usuário, um admin deve elevar manualmente sua role
    -- no painel de Gestão de Usuários do sistema ou via Supabase Dashboard.
    'visitante',
    true
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cria o gatilho na tabela de autenticação
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Habilitar RLS (Row Level Security) na tabela profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Função auxiliar (SECURITY DEFINER) para verificar admin sem recursão
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Política 1: Todos podem ler seu próprio perfil
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

-- Política 2: Apenas ADMINS podem ler todos os perfis
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT 
USING (public.is_admin());

-- Política 3: Apenas ADMINS podem atualizar perfis
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" 
ON public.profiles FOR UPDATE 
USING (public.is_admin());

-- Política 4: Usuários podem atualizar seus campos básicos (exceto role - confiaremos na UI)
DROP POLICY IF EXISTS "Users can update own basic profile" ON public.profiles;
CREATE POLICY "Users can update own basic profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- 5. Backfill (Opcional): Criar perfil para usuários que já existem na tabela auth.users mas não em profiles.
INSERT INTO public.profiles (id, nome_completo, role)
SELECT id, email, 'admin'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);

-- 6. Garantir Acesso do Administrador Marcos
INSERT INTO public.profiles (id, nome_completo, role)
VALUES ('5c180f15-d5f2-453a-9013-761efb2414e6', 'Marcos (Admin)', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- =============================================
-- 7. TABELAS DE CONFIGURAÇÕES MESTRAS
-- =============================================

-- 7.1. Colaboradores
CREATE TABLE IF NOT EXISTS public.config_colaboradores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  cargo text,
  custo_mensal numeric DEFAULT 0,
  horas_mensais numeric DEFAULT 160,
  produtividade numeric DEFAULT 100,
  created_at timestamptz DEFAULT now()
);

-- 7.2. Custos Indiretos
CREATE TABLE IF NOT EXISTS public.config_custos_indiretos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  valor numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 7.3. Disciplinas
CREATE TABLE IF NOT EXISTS public.config_disciplinas (
  key text PRIMARY KEY,
  nome text NOT NULL,
  area_ref numeric DEFAULT 0,
  horas_ref numeric DEFAULT 0,
  valor_base numeric DEFAULT 0,
  ticket_minimo numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.config_colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_custos_indiretos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_disciplinas ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura: Qualquer usuário logado pode ler (ou seja, carregar no sistema)
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.config_colaboradores;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.config_custos_indiretos;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.config_disciplinas;

CREATE POLICY "Enable read access for all authenticated users" ON public.config_colaboradores FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable read access for all authenticated users" ON public.config_custos_indiretos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable read access for all authenticated users" ON public.config_disciplinas FOR SELECT USING (auth.role() = 'authenticated');

-- Políticas de Escrita: Apenas Admins podem inserir/atualizar/deletar
DROP POLICY IF EXISTS "Enable write access for admins only" ON public.config_colaboradores;
DROP POLICY IF EXISTS "Enable write access for admins only" ON public.config_custos_indiretos;
DROP POLICY IF EXISTS "Enable write access for admins only" ON public.config_disciplinas;

CREATE POLICY "Enable write access for admins only" ON public.config_colaboradores FOR ALL USING (public.is_admin());
CREATE POLICY "Enable write access for admins only" ON public.config_custos_indiretos FOR ALL USING (public.is_admin());
CREATE POLICY "Enable write access for admins only" ON public.config_disciplinas FOR ALL USING (public.is_admin());

-- Inserções Iniciais Básicas (Opcional - Evita tabelas vazias na primeira rodada)
INSERT INTO public.config_colaboradores (nome, cargo, custo_mensal, horas_mensais, produtividade)
VALUES 
  ('Reinaldo', 'Engenheiro Sênior', 8000, 180, 100),
  ('Adriel', 'Engenheiro Pleno', 2080, 120, 100),
  ('Lucas', 'Técnico', 1400, 100, 100)
ON CONFLICT DO NOTHING;

INSERT INTO public.config_custos_indiretos (nome, valor)
VALUES 
  ('Arieli (Administrativo)', 1499),
  ('Estrutura (Aluguel/Infra)', 2595)
ON CONFLICT DO NOTHING;

INSERT INTO public.config_disciplinas (key, nome, area_ref, horas_ref, valor_base, ticket_minimo)
VALUES 
  ('eletrico', 'Elétrico', 200, 12, 950, 950),
  ('hidrossanitario', 'Hidrossanitário', 200, 18, 2200, 2200),
  ('ppci', 'PPCI', 200, 20, 2200, 1800),
  ('spda', 'SPDA', 200, 10, 1200, 950),
  ('telecom', 'Telecom/Rede lógica', 200, 8, 950, 850),
  ('cftv', 'CFTV', 200, 8, 950, 850),
  ('climatizacao', 'Climatização', 200, 16, 1800, 1500),
  ('exaustao', 'Exaustão/Ventilação', 200, 14, 1700, 1400),
  ('gas', 'Gás', 200, 12, 1500, 1200)
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- 8. AUDITORIA DE USUÁRIOS
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'login', 'logout', 'password_reset', 'role_change', 'account_created'
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_audit_logs ENABLE ROW LEVEL SECURITY;
-- Apenas admin pode ver a auditoria
DROP POLICY IF EXISTS "Enable read for admins" ON public.user_audit_logs;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.user_audit_logs;

CREATE POLICY "Enable read for admins" ON public.user_audit_logs FOR SELECT USING (public.is_admin());
CREATE POLICY "Enable insert for authenticated users" ON public.user_audit_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- 9. FUNÇÕES DE LOGIN SECURITY DEFINER
-- =============================================

CREATE OR REPLACE FUNCTION public.log_failed_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Tentar achar o user_id baseado no email na tabela interna do auth
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
  
  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET failed_login_attempts = failed_login_attempts + 1
    WHERE id = v_user_id;
    
    -- Se chegou a 5, bloqueia por 30 mins
    UPDATE public.profiles
    SET locked_until = now() + interval '30 minutes'
    WHERE id = v_user_id AND failed_login_attempts >= 5;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_failed_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET failed_login_attempts = 0,
      locked_until = null,
      last_login_at = now()
  WHERE id = auth.uid();
END;
$$;


-- =============================================
-- 10. HISTÓRICO DE PROJETOS (NUVEM)
-- =============================================
CREATE TABLE IF NOT EXISTS public.projetos_historico (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  saved_at timestamptz DEFAULT now(),
  project_data jsonb,
  team_data jsonb,
  costs_data jsonb,
  settings_data jsonb,
  result_data jsonb,
  ai_payload jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.projetos_historico ENABLE ROW LEVEL SECURITY;

-- Drop policies if exist to ensure idempotency
DROP POLICY IF EXISTS "Usuários podem ler seus projetos" ON public.projetos_historico;
DROP POLICY IF EXISTS "Admins podem ler todos os projetos" ON public.projetos_historico;
DROP POLICY IF EXISTS "Usuários podem criar projetos" ON public.projetos_historico;
DROP POLICY IF EXISTS "Usuários podem atualizar seus projetos" ON public.projetos_historico;
DROP POLICY IF EXISTS "Usuários podem deletar seus projetos" ON public.projetos_historico;

-- Ler: O próprio usuário, ou Administradores
CREATE POLICY "Usuários podem ler seus projetos" ON public.projetos_historico FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins podem ler todos os projetos" ON public.projetos_historico FOR SELECT USING (public.is_admin());

-- Escrever: Só pode criar em seu nome
CREATE POLICY "Usuários podem criar projetos" ON public.projetos_historico FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Atualizar/Deletar: Só os próprios projetos
CREATE POLICY "Usuários podem atualizar seus projetos" ON public.projetos_historico FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem deletar seus projetos" ON public.projetos_historico FOR DELETE USING (auth.uid() = user_id);


-- =============================================
-- 11. SEED DATA — Disciplinas Padrão
-- =============================================
-- Execute este bloco para popular o banco com as disciplinas de engenharia padrão.
-- Use ON CONFLICT para ser idempotente (pode rodar várias vezes sem duplicar).

INSERT INTO public.config_disciplinas (key, nome, area_ref, horas_ref, valor_base, ticket_minimo)
VALUES
  ('eletrico',        'Elétrico',               200, 12,  950,  950),
  ('hidrossanitario', 'Hidrossanitário',         200, 18, 2200, 2200),
  ('ppci',            'PPCI',                    200, 20, 2200, 1800),
  ('spda',            'SPDA',                    200, 10, 1200,  950),
  ('telecom',         'Telecom/Rede lógica',     200,  8,  950,  850),
  ('cftv',            'CFTV',                    200,  8,  950,  850),
  ('climatizacao',    'Climatização',            200, 16, 1800, 1500),
  ('exaustao',        'Exaustão/Ventilação',     200, 14, 1700, 1400),
  ('gas',             'Gás',                     200, 12, 1500, 1200)
ON CONFLICT (key) DO UPDATE SET
  nome          = EXCLUDED.nome,
  area_ref      = EXCLUDED.area_ref,
  horas_ref     = EXCLUDED.horas_ref,
  valor_base    = EXCLUDED.valor_base,
  ticket_minimo = EXCLUDED.ticket_minimo;


-- =============================================
-- 12. LIMPEZA E RESET — Colaboradores e Custos
-- =============================================
-- IMPORTANTE: Execute este bloco se houver duplicatas nas tabelas.
-- Ele apaga TUDO e reinicia com os dados corretos e únicos.

-- Adiciona constraint UNIQUE em 'nome' para prevenir duplicatas futuras
ALTER TABLE public.config_colaboradores
  DROP CONSTRAINT IF EXISTS config_colaboradores_nome_key;
ALTER TABLE public.config_colaboradores
  ADD CONSTRAINT config_colaboradores_nome_key UNIQUE (nome);

ALTER TABLE public.config_custos_indiretos
  DROP CONSTRAINT IF EXISTS config_custos_indiretos_nome_key;
ALTER TABLE public.config_custos_indiretos
  ADD CONSTRAINT config_custos_indiretos_nome_key UNIQUE (nome);

-- Limpa e repopula colaboradores (resolve duplicatas de execuções anteriores)
DELETE FROM public.config_colaboradores;
INSERT INTO public.config_colaboradores (nome, cargo, custo_mensal, horas_mensais, produtividade)
VALUES
  ('Reinaldo', 'Engenheiro Sênior', 8000, 180, 100),
  ('Adriel',   'Engenheiro Pleno',  2080, 120, 100),
  ('Lucas',    'Técnico',           1400, 100, 100);

-- Limpa e repopula custos indiretos
DELETE FROM public.config_custos_indiretos;
INSERT INTO public.config_custos_indiretos (nome, valor)
VALUES
  ('Arieli (Administrativo)',   1499),
  ('Estrutura (Aluguel/Infra)', 2595);

