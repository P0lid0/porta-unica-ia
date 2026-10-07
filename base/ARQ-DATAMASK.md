---
id: ARQ-DATAMASK
titulo: Arquitetura de criptografia e mascaramento do Orion DataMask
classe: 4-ip-critico
acesso: [engenharia, seguranca]
dono: Bruno Costa (Engenharia)
origem: File Server / Engenharia / Arquitetura
revisado_em: 2026-06-18
validade_meses: 12
---
# Orion DataMask — arquitetura de criptografia (CONFIDENCIAL)

- O mascaramento é determinístico e preserva formato (FPE, baseado em FF1 com AES-256), para manter a integridade referencial entre arquivos VSAM, DB2 e sequenciais.
- As chaves de mascaramento ficam no cofre do cliente (ICSF/HSM do próprio mainframe do cliente); a Orion nunca tem acesso às chaves.
- A rotina de normalização de campos compactados (COMP-3) é proprietária e objeto de patente.
- Logs de execução não registram valores originais, apenas contadores e hashes.
