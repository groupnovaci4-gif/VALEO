/**
 * Options communes à TOUTES les Cloud Functions (région, instances).
 * Module importé en premier par chaque fichier qui déclare des fonctions :
 * les `import` sont évalués avant le corps de index.ts, un `setGlobalOptions`
 * placé dans index.ts arriverait trop tard pour les fonctions des autres modules
 * (elles partiraient en us-central1).
 */
import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({ region: 'europe-west1', maxInstances: 20 });
