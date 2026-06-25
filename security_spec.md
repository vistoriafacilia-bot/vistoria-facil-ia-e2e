# Especificação de Segurança do Firestore - Vistoria Fácil IA

## 1. Invariantes de Dados
1. Um usuário só pode ler e escrever seus próprios dados (users/{userId}).
2. Um imóvel (properties/{propertyId}) só pode ser lido, criado, atualizado ou excluído pelo seu proprietário (`userId == request.auth.uid`).
3. Uma vistoria (inspections/{inspectionId}) só pode ser lida, criada, atualizada ou excluída pelo seu proprietário (`userId == request.auth.uid`).
4. Os cômodos e fotos que residem sob `inspections/{inspectionId}/rooms` e `inspections/{inspectionId}/photos` herdam as regras de acesso da vistoria pai, ou seja, só podem ser acessados se o usuário autenticado for o proprietário da vistoria correspondente.
5. Os eventos do sistema (`events`) servem para auditoria de custos e só podem ser inseridos pelo usuário autenticado para si mesmo.

## 2. Payloads da "Dirty Dozen" (Cenários de Ataque)
Aqui estão os payloads que devem ser explicitamente rejeitados pelas regras de segurança:

1. **Tentativa de Spoofing de Perfil de Usuário**: Usuário A tenta modificar o perfil do Usuário B.
2. **Atualização de Privilégios/Plano de Forma Não Autorizada**: Usuário tenta mudar seu campo `plan` para "premium" ou similar diretamente via SDK do cliente.
3. **Criação de Imóvel para Outro Usuário**: Usuário tenta definir `userId` como um UID diferente durante a criação do imóvel.
4. **Leitura de Imóveis Alheios**: Usuário A tenta consultar a lista de imóveis ou obter um imóvel específico que pertence ao Usuário B.
5. **Criação de Vistoria Referenciando Imóvel de Terceiros**: Usuário tenta criar uma vistoria informando um `propertyId` de um imóvel pertencente a outro usuário.
6. **Injeção de ID Malicioso**: Tentativa de criar um imóvel ou vistoria usando um ID contendo caracteres especiais ou strings gigantes (Denial of Wallet).
7. **Modificação Retroativa de Campos Imutáveis**: Usuário tenta alterar o campo `createdAt` de um imóvel ou vistoria após a criação.
8. **Substituição de Fotos de Outro Usuário**: Usuário tenta carregar ou atualizar fotos em uma vistoria de outro usuário.
9. **Manipulação de Status de Vistoria Concluída**: Usuário tenta reverter ou alterar dados de uma vistoria cujo status já é final ("concluida" ou "pdf_gerado").
10. **Bypass de Limites (Inserir >10 fotos)**: O aplicativo do cliente deve respeitar o limite, e a vistoria deve rejeitar adições não autorizadas, ou podemos auditar os eventos.
11. **Envio de Eventos Fraudulentos**: Usuário tenta inserir eventos em nome de outro UID.
12. **Leitura Geral de Auditoria**: Usuário comum tenta realizar uma query aberta de todos os eventos de todos os usuários do sistema.

## 3. Estrutura de Testes
Os testes garantem que qualquer uma dessas operações inseguras retorne `PERMISSION_DENIED`.
