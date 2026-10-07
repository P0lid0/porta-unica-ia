---
id: DEV-SEG
titulo: Padrão de Desenvolvimento Seguro
classe: 1-interno
acesso: [engenharia, seguranca]
dono: Bruno Costa (Engenharia)
origem: File Server / Engenharia / Padrões
revisado_em: 2026-05-30
validade_meses: 12
---
# Desenvolvimento Seguro

- Todo código passa por revisão por pares antes de entrar na linha principal.
- Análise estática (SAST) e de dependências (SCA) rodam a cada build; achados críticos bloqueiam a liberação.
- Treinamento de desenvolvimento seguro (OWASP) anual para a Engenharia.
- Segregação de ambientes: desenvolvimento, homologação e produção separados; dados de produção de cliente não são usados em teste sem mascaramento.
- Assinatura dos pacotes liberados e trilha de auditoria de quem gerou cada versão.
