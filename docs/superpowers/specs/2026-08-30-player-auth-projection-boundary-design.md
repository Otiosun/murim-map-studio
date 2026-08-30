# Player Auth + Projection Boundary 8B — Design

**Status:** aprovado para planejamento em 30/08/2026  
**Base canônica:** `foundation/player-knowledge-v0` @ `3c936d3ac981b453d55343d24aec0ba25d541cf1`  
**Escopo:** Fase 8B — identidade/autenticação real do jogador + boundary server-side de `MapProjection`

## 1. Objetivo

Transformar o Player Knowledge Core do 8A em uma superfície realmente autenticada: um jogador autorizado entra com e-mail + OTP, o servidor verifica sua sessão e devolve somente a `MapProjection` correspondente à identidade autenticada.

Este corte não implementa o renderer final do mapa. Ele estabelece a fronteira de identidade e autorização sobre a qual o renderer do próximo corte poderá confiar.

## 2. Decisões fechadas

- Autenticação V0: Supabase Auth.
- UX inicial: e-mail + OTP numérico de 6 dígitos, sem senha.
- Modo de acesso: invite-only; não existe self-signup público.
- `signInWithOtp` sempre usa `shouldCreateUser: false`.
- Supabase SSR usa cookies através de `@supabase/ssr`.
- Identidade em código server-side é validada com `supabase.auth.getClaims()`; `getSession()` nunca é usado como prova de identidade/autorização.
- O resto da aplicação não depende diretamente de Supabase Auth. Existe um boundary nosso `PlayerSession`.
- V0 usa `playerId = JWT sub` somente dentro do adapter Supabase. Essa equivalência não faz parte do contrato público e pode ser substituída no futuro por tabela de vínculo sem alterar consumidores.
- O player app não recebe `service_role`, não consulta `world_private` e não monta autorização no browser.
- O endpoint player-facing não aceita `playerId`, `ownerUserId`, canonical ID ou world ID fornecidos pelo cliente.
- A leitura usa o cliente SSR autenticado + RLS existente em `player_api`, com filtro explícito pelo `playerId` validado como defesa adicional.
- A resposta é novamente validada pelo schema estrito de `MapProjection` antes de sair do servidor.
- Dados por jogador usam resposta `private, no-store`; nenhuma projeção autenticada é cache compartilhado.

## 3. Fora de escopo do 8B

- Renderer SVG/React do mapa do jogador.
- Direção visual final do player map.
- Login com Discord, Google, telefone ou senha.
- UI ADM para convidar/criar jogadores.
- Tabela de identidade multi-provider.
- Notas privadas.
- Compartilhamento de KnowledgeFact.
- Exploração/Opportunity runtime.
- Configuração de SMTP de produção.
- Playwright e matriz multi-browser completa, reservados para Fase 10.

Enquanto não houver UI ADM de convite, criação/autorização de usuários é uma operação administrativa confiável via Supabase Dashboard/Admin API. Usuário desconhecido nunca é criado pelo formulário de login.

## 4. Fluxo de autenticação

### 4.1 Solicitar código

1. Jogador abre `/login`.
2. Informa um e-mail.
3. Server Action normaliza o e-mail e chama `signInWithOtp({ email, options: { shouldCreateUser: false } })`.
4. A resposta visual é deliberadamente genérica: se o endereço estiver autorizado, um código foi enviado.
5. A interface passa para o estado de entrada do OTP sem revelar se aquele e-mail existe.

### 4.2 Verificar código

1. Jogador informa o OTP de 6 dígitos.
2. Server Action chama `verifyOtp({ email, token, type: 'email' })`.
3. Em sucesso, o Supabase SSR persiste a sessão em cookies e redireciona para `/`.
4. Código inválido/expirado retorna erro genérico de autenticação e nunca detalhes internos do Auth.

### 4.3 Renovação de sessão

O app usa o padrão oficial de Proxy do Next.js/Supabase SSR para atualizar cookies de sessão. O Proxy usa `getClaims()` para validar/renovar identidade e não `getSession()` como autorização.

### 4.4 Logout

Logout é uma mutação POST/server-side. A sessão é validada, `signOut()` é executado e o usuário volta para `/login`.

## 5. Boundary `PlayerSession`

Contrato mínimo:

```ts
export interface PlayerSession {
  sessionVersion: 1;
  playerId: string;
}

export interface PlayerSessionResolver {
  resolve(): Promise<PlayerSession | null>;
}
```

O adapter Supabase:

1. chama `getClaims()`;
2. recusa sessão ausente, inválida ou sem `sub` UUID válido;
3. transforma apenas o `sub` validado em `PlayerSession`;
4. não expõe access token, refresh token, e-mail ou objeto `User` ao domínio do mapa.

A escolha `playerId = sub` é uma estratégia V0 encapsulada. Nenhum renderer, endpoint de projeção ou package de domínio pode depender de Supabase-specific claims.

## 6. Boundary de dados do jogador

### 6.1 Endpoint

`GET /api/map-projection`

Não possui parâmetros de identidade.

Fluxo:

1. resolver `PlayerSession` a partir dos cookies;
2. retornar `401` se não autenticado;
3. consultar `player_api.map_nodes` e `player_api.map_routes` pelo cliente Supabase SSR autenticado;
4. aplicar também `owner_user_id = session.playerId` explicitamente;
5. converter geometry/rows desconhecidos em inputs tipados por meio de parser runtime fail-closed;
6. chamar `buildPlayerMapProjection` do 8A;
7. executar `MapProjectionSchema.parse()`;
8. executar guard anti-vazamento recursivo já existente;
9. retornar JSON com `Cache-Control: private, no-store`.

O endpoint nunca consulta `world_private` nem necessita de `service_role`.

### 6.2 Geometria

`geometry` continua `unknown` no tipo gerado do Supabase. O endpoint não usa `as any`. Um adapter runtime valida o shape de Point/LineString recebido e recusa a resposta inteira se a geometria não puder ser convertida com segurança para `WorldPoint`/`PolylineGeometry`.

### 6.3 Empty state

Jogador autenticado e autorizado sem conhecimento projetado recebe `200` com `MapProjection` vazia válida; isso não é erro de autenticação.

## 7. Configuração Supabase

O ambiente local versionado deve espelhar a política do produto:

- `auth.enable_signup = false`;
- `auth.email.enable_signup = false`;
- `auth.email.otp_length = 6`;
- `auth.email.otp_expiry` permanece finito e explicitamente versionado;
- template `magic_link` local usa `{{ .Token }}` como código, não depende de clique em link;
- Mailpit/Inbucket local pode capturar os e-mails de desenvolvimento;
- hosted/staging deve reproduzir a mesma política no Auth Dashboard antes de teste externo.

Nenhuma credencial SMTP real entra no Git. SMTP próprio é requisito operacional antes de usuários externos, mas não é requisito técnico para fechar 8B.

## 8. Segurança e invariantes

1. Self-signup é impossível pelo fluxo oficial e bloqueado também por configuração local.
2. Usuário não autenticado recebe `401` do endpoint.
3. Browser nunca escolhe a identidade cuja projeção será lida.
4. RLS continua como defesa de banco; o endpoint não substitui RLS.
5. A/B autenticados recebem projeções distintas da mesma verdade canônica.
6. Player A não pode recuperar rows de B mudando query/body/headers permitidos pelo app.
7. A resposta não contém `owner_user_id`, `source_location_id`, `canonicalId`, `worldId`, `secretPayload`, auth token ou e-mail.
8. `service_role` não entra em bundle/env do player app.
9. Session cookie inválido/expirado não é aceito por `getSession()`; identidade precisa passar por `getClaims()`.
10. Projeção autenticada não pode ser armazenada em cache público/compartilhado.
11. Geometry inválida causa falha fechada, nunca coerção silenciosa.
12. Erros de OTP não permitem enumeração deliberada de contas pela copy da UI.

## 9. Estrutura de componentes

Responsabilidades previstas:

- `apps/player/lib/supabase/server.ts` — cliente SSR server-side baseado em cookies.
- `apps/player/lib/supabase/client.ts` — cliente browser somente quando necessário; não possui autorização de domínio.
- `apps/player/lib/supabase/proxy.ts` — renovação segura da sessão.
- `apps/player/proxy.ts` — integração Next.js Proxy/matcher.
- `apps/player/lib/auth/player-session.ts` — contrato `PlayerSession` e resolver provider-neutral.
- `apps/player/lib/auth/supabase-player-session.ts` — adapter Supabase `getClaims() -> PlayerSession`.
- `apps/player/app/login/*` — formulário OTP e Server Actions.
- `apps/player/app/auth/signout/route.ts` — logout POST.
- `apps/player/lib/map/player-projection-source.ts` — leitura RLS-safe e parsing runtime dos rows.
- `apps/player/app/api/map-projection/route.ts` — boundary HTTP final.
- `supabase/templates/magic-link.html` — template local com código OTP.
- `supabase/config.toml` — configuração invite-only/OTP local.

Arquivos podem ser subdivididos no plano se um módulo exceder uma responsabilidade clara; lógica de domínio não vai para componentes React.

## 10. Tratamento de erros

- `401 unauthenticated`: ausência/expiração/invalidez de sessão.
- `400 invalid OTP`: código malformado antes de chamar Auth.
- `429/rate limit`: UI informa para aguardar antes de solicitar novo código.
- `502 projection source invalid`: boundary interno detectou row/geometry inesperada; resposta pública não inclui payload bruto.
- `500 projection validation failed`: schema/anti-leak guard recusou o resultado; nenhum fallback inseguro é enviado.

Logs detalhados de produção/observabilidade estruturada continuam para Fase 10; mensagens públicas permanecem mínimas.

## 11. Testes necessários para fechar 8B

### Unitários

- resolver aceita claims válidos e extrai somente `playerId`;
- resolver rejeita ausência de claims, `sub` inválido e erro de Auth;
- OTP request sempre usa `shouldCreateUser: false`;
- OTP verify exige exatamente seis dígitos;
- parser de rows aceita known/ghost válidos e rejeita geometry inválida;
- handler não aceita identidade por query/body;
- projection response passa schema + anti-leak guard;
- headers de cache são privados/no-store.

### Integração/segurança

- config local impede signup;
- sessão A só lê A;
- sessão B só lê B;
- A/B recebem projeções diferentes;
- request sem JWT/sessão recebe `401`;
- tentativa de selecionar outro `owner_user_id` não atravessa RLS;
- `world_private` permanece inacessível;
- tipos gerados do banco continuam sem drift;
- `supabase db reset --local` continua reproduzível.

### CI final

Gate 8B exige o mesmo head com `quality` e `database` verdes. Nenhum workflow temporário com write permission pode permanecer.

## 12. Critério de saída do 8B

O corte 8B fecha quando um usuário previamente autorizado consegue:

`/login -> solicitar OTP -> verificar OTP -> estabelecer sessão -> chamar /api/map-projection -> receber apenas sua MapProjection`

E quando a suíte prova simultaneamente que outro jogador recebe projeção diferente e que um cliente não autenticado ou tentando selecionar identidade alheia não obtém dados.

O próximo corte da Fase 8 pode então tratar o renderer SVG/React, graus visuais de rota, detalhe touch/click e requisitos mobile sobre uma fronteira autenticada já confiável.
