# fase2-documentar-CALCJUR

- Fase 2, caminho: **local**
- Motivos: Código-fonte: processado só no servidor interno
- Modelo: gpt-oss:20b (local)
- Tempo: 674 s no notebook (CPU, sem GPU)
- Gerado em: 2026-10-04T20:04:26.425Z

---
## Objetivo  
O programa **CALCJUR** calcula encargos (multa e juros) sobre parcelas em atraso e grava os registros de cobrança resultantes. Ele lê um arquivo de parcelas (`ARQ-PARCELAS`), determina o número de dias de atraso em relação à data de processamento, aplica regras específicas de multa e juros (dependendo do tipo de cliente) e grava apenas as parcelas que excedem a carência de dias de atraso, exceto para funcionários.

## Entradas e saídas  
| Fonte | Tipo | Descrição |
|-------|------|-----------|
| `ARQ-PARCELAS` | Arquivo de entrada | Registro `REG-PARCELA` contendo contrato, número da parcela, data de vencimento, valor, tipo de cliente (`F`, `J`, `X`). |
| `WS-DT-PROCESSAMENTO` | Variável de controle | Data atual de processamento (YYYYMMDD). |
| `ARQ-COBRANCA` | Arquivo de saída | Registro `REG-COBRANCA` contendo contrato, número da parcela, dias de atraso, multa, juros e total. |

## Regras de negócio  
1. **Ajuste Y2K** (parágrafo 2100) – Se a data de vencimento for anterior a 01/01/1999, dias de atraso são zero.  
2. **Carência** – Se dias de atraso forem maiores que `WS-CARENCIA-DIAS` (03 dias) e a parcela não for de um funcionário (`PAR-FUNCIONARIO`), então calcula encargos.  
3. **Multa** – Percentual fixo de 2 % (`WS-PERC-MULTA`).  
4. **Juros** – Taxa diária de 0,000333 (`WS-TAXA-JUROS-DIA`).  
   - Para clientes jurídicos (`PAR-PESSOA-JURIDICA`) a taxa é multiplicada por 1,5.  
5. **Limite de juros** – Se os juros calculados forem maiores que o valor da parcela, os juros são limitados ao valor da parcela (regra de 2004).  
6. **Total** – Soma do valor da parcela, multa e juros.  
7. **Gravação** – Apenas parcelas que atendem à regra 2 são gravadas em `ARQ-COBRANCA`.  

## Cálculos  
| Item | Fórmula | Observação |
|------|---------|------------|
| Dias de atraso (`WS-DIAS-ATRASO`) | `FUNCTION INTEGER-OF-DATE(WS-DT-PROCESSAMENTO) - FUNCTION INTEGER-OF-DATE(PAR-DT-VENCTO)` | Se `PAR-DT-VENCTO < 19990101`, valor zero. |
| Multa (`COB-MULTA`) | `PAR-VALOR * WS-PERC-MULTA` | Rounding aplicado. |
| Juros (`COB-JUROS`) | `PAR-VALOR * WS-TAXA-JUROS-DIA * WS-DIAS-ATRASO * (1,5 se PAR-PESSOA-JURIDICA)` | Rounding aplicado. |
| Limite de juros | Se `COB-JUROS > PAR-VALOR` então `COB-JUROS = PAR-VALOR`. |
| Total (`COB-TOTAL`) | `PAR-VALOR + COB-MULTA + COB-JUROS` | Rounding aplicado. |

## Execução e dependências  
1. O programa é iniciado em `0000-PRINCIPAL`.  
2. A data de processamento é obtida via `ACCEPT WS-DT-PROCESSAMENTO FROM DATE YYYYMMDD`.  
3. Os arquivos são abertos (`OPEN INPUT ARQ-PARCELAS OUTPUT ARQ-COBRANCA`).  
4. O loop principal lê cada registro de parcelas (`1000-LE-PARCELA`) e, enquanto não atingir o fim do arquivo (`WS-FIM-ARQUIVO = 'S'`), executa `2000-PROCESSA`.  
5. `2000-PROCESSA` chama `2100-CALCULA-ATRASO`, verifica a regra de carência e, se válida, chama `2200-CALCULA-ENCARGOS` e `2300-GRAVA-COBRANCA`.  
6. Ao final, os arquivos são fechados e exibidos os contadores de registros lidos e gravados.  

Dependências externas:  
- Sistema de arquivos que disponibiliza `PARCELAS` e aceita gravação em `COBRANCA`.  
- Funções de data do COBOL (`FUNCTION INTEGER-OF-DATE`).  

## Pontos de atenção  
- **Formato de data**: `PAR-DT-VENCTO` e `WS-DT-PROCESSAMENTO` são inteiros no formato `YYYYMMDD`.  
- **Taxa de juros**: O valor `0,000333` corresponde a 0,0333 % ao dia.  
- **Limite de juros**: A regra de 2004 impede que os juros ultrapassem o valor da parcela.  
- **Funcionários**: Parcela de tipo `X` (funcionário) não gera cobrança, mesmo que ultrapasse a carência.  
- **Carência**: Apenas dias de atraso superiores a 3 dias são considerados.  
- **Ajuste Y2K**: Registros com vencimento antes de 1999 são tratados como não atrasados.  

## Perguntas para o especialista  
1. Qual é o critério exato para determinar se uma parcela pertence a um funcionário? (Apenas o campo `PAR-FUNCIONARIO` ou há outras condições?)  
2. O arquivo `COBRANCA` possui algum índice ou estrutura de arquivo que requer ordenação?  
3. Há algum limite de tamanho para o arquivo de parcelas que o programa pode processar sem falhas?  
4. Como são tratadas as situações em que o arquivo de parcelas contém registros duplicados ou corrompidos?  
5. Existe algum log de erro ou arquivo de auditoria que o programa gera além do `DISPLAY` final?  
6. A regra de multa de 2 % (2004) é fixa ou pode ser alterada por parâmetro de execução?  
7. O programa foi testado com datas de processamento em anos bissextos; há algum ajuste necessário para esses casos?
