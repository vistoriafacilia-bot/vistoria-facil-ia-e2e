# SR-02A - Git Lock Recovery Diagnostic

Status: Bloqueado

Push: nao executado
Deploy: nao executado
UAT: nao executado

## Processos Git

- pid=25100; age_minutes=3.63; points_to_repo=False; command_line_redacted=git.exe -c core.hooksPath=NUL -c core.fsmonitor=false status --porcelain
- pid=9660; age_minutes=0.26; points_to_repo=False; command_line_redacted=git.exe -c core.hooksPath=NUL -c core.fsmonitor=false rev-parse HEAD
- pid=22492; age_minutes=0.26; points_to_repo=False; command_line_redacted=git.exe -c core.hooksPath=NUL -c core.fsmonitor=false remote -v
- pid=25240; age_minutes=0.26; points_to_repo=False; command_line_redacted=git.exe config --null --get core.fsmonitor
- pid=21140; age_minutes=0.17; points_to_repo=False; command_line_redacted=git.exe -c core.hooksPath=NUL -c core.fsmonitor=false status --porcelain

## Index lock

- exists: True
- length: 0
- last_write_time: 2026-06-25T14:28:05.6945355-03:00
- age_minutes: 111.64

## Operacao Git em andamento

- .git\MERGE_HEAD: False
- .git\REBASE_HEAD: False
- .git\CHERRY_PICK_HEAD: False
- .git\BISECT_LOG: False
- .git\rebase-merge: False
- .git\rebase-apply: False

## Decisao segura

- safe_action: block
- reason: active git.exe process command line does not clearly identify repo association
