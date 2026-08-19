#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## user_problem_statement: "Inscription minimale coopérative (Nom responsable + Email + Mot de passe), login coop via Email+Mot de passe, login planteur via Téléphone+Code 6 chiffres, et section Profil de la coopérative avec barre de complétude."

## frontend:
##   - task: "Création coopérative minimale (Nom responsable + Email + MDP)"
##     implemented: true
##     working: "NA"
##     file: "frontend/src/coop/auth.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "CreateCoop réparé et remis en version minimale. onCreateCoop crée une coop avec nom provisoire 'Ma coopérative'. Le patron est créé avec email + hash du mot de passe (hashSecret)."
##   - task: "Login Coopérative via Email + Mot de passe"
##     implemented: true
##     working: "NA"
##     file: "frontend/src/coop/auth.tsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "Onglet Coop = email + mot de passe (verifyPinAsync sur staff.pin). Onglet Planteur = téléphone + code 6 chiffres inchangé."
##   - task: "Profil de la coopérative avec barre de complétude"
##     implemented: true
##     working: "NA"
##     file: "frontend/src/coop/sheets.tsx, frontend/src/coop/screens.tsx, frontend/src/coop/store.ts"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "Carte 'Profil de la coopérative' (testID coop-profile) dans l'onglet Compte du Patron avec % de complétude. Ouvre CoopProfileSheet (identité complète + coordonnées + responsable). store.setCoopProfile + updateStaff sur enregistrement."

## metadata:
##   created_by: "main_agent"
##   version: "1.1"
##   test_sequence: 1
##   run_ui: true

## test_plan:
##   current_focus:
##     - "Création coopérative minimale (Nom responsable + Email + MDP)"
##     - "Login Coopérative via Email + Mot de passe"
##     - "Profil de la coopérative avec barre de complétude"
##   stuck_tasks: []
##   test_all: false
##   test_priority: "high_first"

## agent_communication:
##     -agent: "main"
##     -message: "auth.tsx était corrompu (CreateCoop cassé) — réparé. Implémenté l'inscription minimale coop + login email/MDP + Profil coopérative avec barre de complétude. tsc --noEmit passe. Merci de tester les 3 flows côté frontend (données d'aperçu éphémères, créer les comptes à la volée). Voir /app/memory/test_credentials.md."

## NOUVELLE ITÉRATION — Terminologie « Avance » + recouvrement + reçus de solde
## frontend:
##   - task: "Recouvrement d'avance à la pesée (partiel possible)"
##     implemented: true
##     working: "NA"
##     file: "frontend/src/coop/sheets.tsx (PeseeSheet), frontend/src/coop/store.ts (addCollection _repay FIFO)"
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "Quand un planteur a une avance approuvée (soldeRestant>0), la pesée affiche 'Avance à recouvrer' + choix Recouvrer tout/Partiel + montant. Recouvrement déduit du net payé (retenue 'Recouvrement d'avance'). Reste d'avance conservé (loan.soldeRestant). Recouvrement partiel: avance 50000, recouvré 30000 -> reste 20000."
##   - task: "Reçu de solde distinct référençant le reçu initial (reçu original inchangé)"
##     implemented: true
##     working: "NA"
##     file: "frontend/src/coop/store.ts (settleMemberDue + resteSolde), frontend/src/coop/sheets.tsx (SettlementReceipt/settlementHtml), frontend/src/coop/lib.ts (memberStats/outstandingReste)"
##     priority: "high"
##     needs_retesting: true
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "Solder le reste dû ne modifie PLUS le bordereau initial (paye/reste figés). Un nouveau reçu de solde est créé avec son propre N°, 'Solde du reçu N°XXX', montant payé et référence(s). memberStats.reste = reste - resteSolde."
##   - task: "Terminologie Crédit/Prêt/Créance -> Avance (UI + PDF)"
##     implemented: true
##     working: "NA"
##     file: "screens.tsx, sheets.tsx, ui.tsx, reports.ts, lib.ts, app/index.tsx"
##     priority: "medium"
##     needs_retesting: true
##     status_history:
##         -working: "NA"
##         -agent: "main"
##         -comment: "Tous les libellés visibles remplacés: Nouvelle avance, Demande d'avance, Avance accordée/refusée/recouvrée, Total avancé, Reste à recouvrer, Mes avances, etc. Identifiants de code (Loan, onPrets, testID quick-Prêts) inchangés."
