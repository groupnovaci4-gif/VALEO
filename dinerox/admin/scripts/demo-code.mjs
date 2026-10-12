/** Code à 6 chiffres d'un collaborateur de DÉMONSTRATION (émulateurs) : node admin/scripts/demo-code.mjs <e-mail> */
import { totp } from './emulator-lib.mjs';
import { DEMO_STAFF } from './seed-emulators.mjs';

const s = DEMO_STAFF.find((x) => x.email === process.argv[2]);
if (!s?.secret) { console.error('Collaborateur de démonstration inconnu, ou double vérification à activer avec votre appli.'); process.exit(1); }
console.log(totp(s.secret));
process.exit(0);
