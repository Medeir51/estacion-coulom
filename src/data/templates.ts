/** Plantillas de guiones (sección 10.12). */
import type { DeviceGroup } from '../script/devices';

export type TemplateId = 'skeleton' | 'readings' | 'detector' | 'formula';

export const TEMPLATE_IDS: TemplateId[] = ['skeleton', 'readings', 'detector', 'formula'];

function reading(groups: DeviceGroup[]): string {
  if (groups.includes('generator')) return ', " s · V eficaz = ", voltajeRMS()';
  if (groups.includes('isotopes')) return ', " s · cruces en D1 = ", cuentaCruces("D1")';
  return ', " s"';
}

function actuator(groups: DeviceGroup[]): string {
  if (groups.includes('generator')) return 'fijarEspiras(valor)';
  if (groups.includes('isotopes')) return 'polaridad("EM1", valor)';
  if (groups.includes('selector')) return 'fijarVoltaje("C1", valor)';
  return 'Escribir valor';
}

export function templateSource(id: TemplateId, groups: DeviceGroup[]): string {
  switch (id) {
    case 'skeleton':
      return `Inicio
    // Se ejecuta una vez, al empezar el intento
FinInicio

Ciclo
    // Se ejecuta en cada tic de control
FinCiclo
`;
    case 'readings':
      return `Inicio
    tics <- 0
FinInicio

Ciclo
    tics <- tics + 1
    Si tics MOD 100 = 0 Entonces
        Escribir "t = ", tiempo()${reading(groups)}
    FinSi
FinCiclo
`;
    case 'detector':
      return `Ciclo
    Si detector("D1") Entonces
        // Una partícula acaba de cruzar D1: reacciona aquí
        Escribir "Cruce en D1 en t = ", tiempoCruce("D1"), " s"
    FinSi
FinCiclo
`;
    case 'formula':
      return `Ciclo
    // Calcula un valor con una fórmula y aplícalo a un actuador
    valor <- 0   // tu fórmula aquí
    ${actuator(groups)}
FinCiclo
`;
  }
}
