      *================================================================*
      * PROGRAMA : CALCJUR                                             *
      * SISTEMA  : COBRANCA - LOTE NOTURNO                             *
      * AUTOR    : J.R.M.   DATA: 14/06/1997                           *
      * ALTERACAO: 03/1999 - AJUSTE ANO 2000 (VER PARAGRAFO 2100)      *
      * ALTERACAO: 11/2004 - MULTA PASSA DE 10% PARA 2% (CDC)          *
      * (PROGRAMA FICTICIO CRIADO APENAS PARA DEMONSTRACAO)            *
      *================================================================*
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CALCJUR.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT ARQ-PARCELAS ASSIGN TO PARCELAS
                  FILE STATUS IS WS-FS-PARC.
           SELECT ARQ-COBRANCA ASSIGN TO COBRANCA
                  FILE STATUS IS WS-FS-COBR.
       DATA DIVISION.
       FILE SECTION.
       FD  ARQ-PARCELAS RECORDING MODE F.
       01  REG-PARCELA.
           05  PAR-CONTRATO          PIC 9(10).
           05  PAR-NUM-PARCELA       PIC 9(03).
           05  PAR-DT-VENCTO         PIC 9(08).
           05  PAR-VALOR             PIC S9(11)V99 COMP-3.
           05  PAR-TIPO-CLIENTE      PIC X(01).
               88  PAR-PESSOA-FISICA     VALUE 'F'.
               88  PAR-PESSOA-JURIDICA   VALUE 'J'.
               88  PAR-FUNCIONARIO       VALUE 'X'.
       FD  ARQ-COBRANCA RECORDING MODE F.
       01  REG-COBRANCA.
           05  COB-CONTRATO          PIC 9(10).
           05  COB-NUM-PARCELA       PIC 9(03).
           05  COB-DIAS-ATRASO       PIC 9(05).
           05  COB-MULTA             PIC S9(11)V99 COMP-3.
           05  COB-JUROS             PIC S9(11)V99 COMP-3.
           05  COB-TOTAL             PIC S9(11)V99 COMP-3.
       WORKING-STORAGE SECTION.
       01  WS-FS-PARC                PIC X(02).
       01  WS-FS-COBR                PIC X(02).
       01  WS-FIM-ARQUIVO            PIC X(01) VALUE 'N'.
       01  WS-DT-PROCESSAMENTO       PIC 9(08).
       01  WS-DIAS-ATRASO            PIC S9(05) COMP-3.
       01  WS-TAXA-JUROS-DIA         PIC 9V9(06) VALUE 0,000333.
       01  WS-PERC-MULTA             PIC 9V99    VALUE 0,02.
       01  WS-CARENCIA-DIAS          PIC 9(02)   VALUE 03.
       01  WS-CONT-LIDOS             PIC 9(09)   VALUE ZERO.
       01  WS-CONT-GRAVADOS          PIC 9(09)   VALUE ZERO.
       PROCEDURE DIVISION.
       0000-PRINCIPAL.
           ACCEPT WS-DT-PROCESSAMENTO FROM DATE YYYYMMDD
           OPEN INPUT ARQ-PARCELAS OUTPUT ARQ-COBRANCA
           PERFORM 1000-LE-PARCELA
           PERFORM 2000-PROCESSA UNTIL WS-FIM-ARQUIVO = 'S'
           CLOSE ARQ-PARCELAS ARQ-COBRANCA
           DISPLAY 'CALCJUR LIDOS: ' WS-CONT-LIDOS
                   ' GRAVADOS: ' WS-CONT-GRAVADOS
           STOP RUN.
       1000-LE-PARCELA.
           READ ARQ-PARCELAS
                AT END MOVE 'S' TO WS-FIM-ARQUIVO
                NOT AT END ADD 1 TO WS-CONT-LIDOS
           END-READ.
       2000-PROCESSA.
           PERFORM 2100-CALCULA-ATRASO
           IF WS-DIAS-ATRASO > WS-CARENCIA-DIAS
              AND NOT PAR-FUNCIONARIO
              PERFORM 2200-CALCULA-ENCARGOS
              PERFORM 2300-GRAVA-COBRANCA
           END-IF
           PERFORM 1000-LE-PARCELA.
       2100-CALCULA-ATRASO.
      *    AJUSTE Y2K: DATAS ANTERIORES A 1999 VEM DO SISTEMA ANTIGO
           IF PAR-DT-VENCTO < 19990101
              MOVE ZERO TO WS-DIAS-ATRASO
           ELSE
              COMPUTE WS-DIAS-ATRASO =
                  FUNCTION INTEGER-OF-DATE(WS-DT-PROCESSAMENTO) -
                  FUNCTION INTEGER-OF-DATE(PAR-DT-VENCTO)
           END-IF.
       2200-CALCULA-ENCARGOS.
           COMPUTE COB-MULTA ROUNDED = PAR-VALOR * WS-PERC-MULTA
           IF PAR-PESSOA-JURIDICA
              COMPUTE COB-JUROS ROUNDED =
                  PAR-VALOR * WS-TAXA-JUROS-DIA * WS-DIAS-ATRASO * 1,5
           ELSE
              COMPUTE COB-JUROS ROUNDED =
                  PAR-VALOR * WS-TAXA-JUROS-DIA * WS-DIAS-ATRASO
           END-IF
      *    LIMITE PEDIDO PELO JURIDICO EM 2004 - NAO REMOVER
           IF COB-JUROS > PAR-VALOR
              MOVE PAR-VALOR TO COB-JUROS
           END-IF
           COMPUTE COB-TOTAL = PAR-VALOR + COB-MULTA + COB-JUROS.
       2300-GRAVA-COBRANCA.
           MOVE PAR-CONTRATO      TO COB-CONTRATO
           MOVE PAR-NUM-PARCELA   TO COB-NUM-PARCELA
           MOVE WS-DIAS-ATRASO    TO COB-DIAS-ATRASO
           WRITE REG-COBRANCA
           ADD 1 TO WS-CONT-GRAVADOS.
