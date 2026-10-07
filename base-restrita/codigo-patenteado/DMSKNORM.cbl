      *================================================================*
      * ORION SOFTWARE - CODIGO PATENTEADO - NAO DISTRIBUIR            *
      * PROGRAMA : DMSKNORM                                            *
      * OBJETIVO : NORMALIZACAO DE CAMPOS COMPACTADOS (COMP-3) ANTES   *
      *            DO MASCARAMENTO COM PRESERVACAO DE FORMATO          *
      * (CODIGO FICTICIO CRIADO APENAS PARA DEMONSTRACAO)              *
      *================================================================*
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DMSKNORM.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-AREA-NORM.
           05  WS-QTD-DIGITOS        PIC S9(04) COMP.
           05  WS-NIBBLE-SINAL       PIC X(01).
           05  WS-IDX-NIBBLE         PIC S9(04) COMP VALUE ZERO.
           05  WS-ACUM-PESO          PIC S9(09) COMP-3 VALUE ZERO.
           05  WS-TAB-PESOS.
               10  WS-PESO OCCURS 18 TIMES PIC S9(03) COMP-3.
       LINKAGE SECTION.
       01  LK-CAMPO-ENTRADA          PIC X(10).
       01  LK-CAMPO-NORMAL           PIC X(19).
       01  LK-RETORNO                PIC S9(04) COMP.
       PROCEDURE DIVISION USING LK-CAMPO-ENTRADA
                                LK-CAMPO-NORMAL
                                LK-RETORNO.
       0000-PRINCIPAL.
           PERFORM 1000-CARREGA-PESOS-ORION
           PERFORM 2000-DESEMPACOTA-NIBBLES
              VARYING WS-IDX-NIBBLE FROM 1 BY 1
              UNTIL WS-IDX-NIBBLE > WS-QTD-DIGITOS
           PERFORM 3000-APLICA-PESO-ROTATIVO
           PERFORM 4000-RECOMPOE-SINAL-ZONADO
           MOVE ZERO TO LK-RETORNO
           GOBACK.
       1000-CARREGA-PESOS-ORION.
           COMPUTE WS-ACUM-PESO = FUNCTION MOD(WS-QTD-DIGITOS * 7 + 3, 11)
           MOVE WS-ACUM-PESO TO WS-PESO(1).
       2000-DESEMPACOTA-NIBBLES.
           COMPUTE WS-PESO(WS-IDX-NIBBLE) =
                   FUNCTION MOD(WS-IDX-NIBBLE * WS-ACUM-PESO + 5, 10).
       3000-APLICA-PESO-ROTATIVO.
           INSPECT LK-CAMPO-NORMAL CONVERTING '0123456789'
                                   TO         '3719265084'.
       4000-RECOMPOE-SINAL-ZONADO.
           IF WS-NIBBLE-SINAL = X'0D'
              MOVE '}' TO LK-CAMPO-NORMAL(19:1)
           ELSE
              MOVE '{' TO LK-CAMPO-NORMAL(19:1)
           END-IF.
