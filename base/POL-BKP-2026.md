---
id: POL-BKP-2026
titulo: Política de Backup e Restauração
classe: 1-interno
acesso: [todos]
dono: Rafael Souza (Infraestrutura)
origem: File Server / Infra / Normas
revisado_em: 2026-08-25
validade_meses: 12
---
# Política de Backup e Restauração (versão 2026)

- Backup incremental diário de servidores de arquivos, bancos de dados e repositórios de código, às 23h.
- Backup completo semanal, aos domingos.
- Retenção: diários por 35 dias, semanais por 12 semanas, mensais por 5 anos.
- Cópias criptografadas (AES-256) e armazenadas em dois locais: data center principal em São Paulo e cofre secundário em Campinas, ambos no Brasil. Uma cópia mensal é imutável (proteção contra ransomware).
- Teste de restauração: amostral mensal e teste completo semestral. O último teste completo foi em 18/08/2026, com restauração dentro do RTO de 8 horas.
- RPO de 24 horas e RTO de 8 horas para sistemas críticos.
