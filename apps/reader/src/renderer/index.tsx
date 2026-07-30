import { createRoot } from 'react-dom/client';
import { Aplicacion } from './aplicacion';
import './estilos.css';

const raiz = document.getElementById('raiz');
if (raiz === null) throw new Error('falta el nodo raiz del renderer');
createRoot(raiz).render(<Aplicacion />);
