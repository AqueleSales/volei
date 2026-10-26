# Vôlei da Quadra — primeira implementação da lógica e sincronização

## O que mudou
- Cadastro de jogador agora inclui a opção **É criança**.
- A interface mostra três categorias de habilidade: iniciante, intermediário e avançado. O nível interno 1–5 continua existindo para cálculo; nível 5 aparece como craque.
- A formação de times tenta distribuir crianças, favorecer pelo menos quatro adultos por equipe quando possível e evita juntar duas crianças sem um jogador de nível 5 no mesmo time. São penalidades de otimização; a interface ainda precisa de uma etapa posterior para explicar e bloquear todas as exceções impossíveis.
- Configuração de rotação: **os dois times descansam** ou **vencedor permanece**.
- Adicionada integração inicial com Supabase para compartilhar o estado entre celulares, com cache local.

## Importante: Supabase é necessário para compartilhar celulares
Sem configurar Supabase, o site continua em modo local e cada celular terá seus próprios dados.

1. Crie um projeto Supabase.
2. No SQL Editor, execute o arquivo `supabase-setup.sql`.
3. Em Project Settings / API, copie a Project URL e a chave pública `anon`/publishable.
4. Cole os valores em `supabase-config.js`.
5. Em Database > Replication/Realtime, habilite a tabela `public.volei_estado` na publicação `supabase_realtime`.
6. Publique a pasta `web` na Vercel.

**Nunca coloque a chave `service_role` no navegador.** A política SQL fornecida permite a qualquer pessoa que tenha a URL e a chave pública ler e alterar a sessão. É uma configuração inicial simples para teste privado, não adequada para um site público. Antes de abrir para qualquer pessoa, adicione autenticação, autorização por grupo e regras RLS restritas.

## Limitações desta etapa
- O sincronismo grava o estado inteiro da sessão; duas alterações simultâneas podem se sobrescrever. Antes de uso concorrente intenso, implementar versão otimista/RPC transacional.
- A entrada manual de uma partida que já começou e o fluxo visual de pessoas `a caminho` ainda precisam de UI própria.
- A regra de crianças/adultos é uma tentativa de otimização; cenários impossíveis devem receber um fluxo explícito de aviso e confirmação do organizador numa etapa seguinte.
- O algoritmo atual ainda conserva parte da estrutura antiga de fila por times; a evolução recomendada é migrar para fila de pessoas e gerar cada próximo confronto dinamicamente.
- `logica.py` foi preservado como referência; o site executa `logica.js`.

## Teste local
Abra `index.html` via um servidor estático local (não `file://` para testar o Service Worker). Confirme cadastro, marcar criança, montar times, pontuar, finalizar e os dois modos de rotação. Configure Supabase antes de testar em dois dispositivos.
