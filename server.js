require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Función auxiliar para hablar con la base de datos de Supabase
async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  return response;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------
// FUNCIONES YA EXISTENTES (cálculo del plan de ahorro)
// ---------------------------------------------------------

function calcularPlan({ montoObjetivo, dineroInicial, ahorroMensual, plazoMeses }) {
  const restante = Math.max(montoObjetivo - dineroInicial, 0);
  const porcentajeProgreso = montoObjetivo > 0
    ? Math.min((dineroInicial / montoObjetivo) * 100, 100)
    : 0;

  const ahorroPorMesNecesario = plazoMeses > 0 ? restante / plazoMeses : restante;
  const ahorroPorSemanaNecesario = ahorroPorMesNecesario / 4.33;
  const ahorroPorDiaNecesario = ahorroPorMesNecesario / 30;

  let mesesEstimados = null;
  if (ahorroMensual > 0) {
    mesesEstimados = Math.ceil(restante / ahorroMensual);
  }

  const esAlcanzable = ahorroMensual >= ahorroPorMesNecesario;

  const alternativas = [];
  if (!esAlcanzable) {
    const ahorroSugerido = Math.ceil(ahorroPorMesNecesario);
    const plazoSugerido = ahorroMensual > 0 ? Math.ceil(restante / ahorroMensual) : null;
    const montoAlternativo = Math.round(dineroInicial + ahorroMensual * plazoMeses);

    alternativas.push(`Aumentar el ahorro mensual a $${ahorroSugerido.toLocaleString('es-AR')}`);
    if (plazoSugerido) {
      alternativas.push(`Extender el plazo a ${plazoSugerido} meses`);
    }
    alternativas.push(`Reducir la meta a $${montoAlternativo.toLocaleString('es-AR')}`);
  }

  return {
    restante: Math.round(restante),
    ahorroPorMesNecesario: Math.round(ahorroPorMesNecesario),
    ahorroPorSemanaNecesario: Math.round(ahorroPorSemanaNecesario),
    ahorroPorDiaNecesario: Math.round(ahorroPorDiaNecesario),
    porcentajeProgreso: Math.round(porcentajeProgreso * 10) / 10,
    mesesEstimados,
    esAlcanzable,
    alternativas
  };
}

app.post('/api/calcular', (req, res) => {
  const { montoObjetivo, dineroInicial, ahorroMensual, plazoMeses } = req.body;

  if (
    typeof montoObjetivo !== 'number' ||
    typeof dineroInicial !== 'number' ||
    typeof ahorroMensual !== 'number' ||
    typeof plazoMeses !== 'number'
  ) {
    return res.status(400).json({ error: 'Faltan datos o tienen un formato inválido.' });
  }

  const plan = calcularPlan({ montoObjetivo, dineroInicial, ahorroMensual, plazoMeses });
  res.json(plan);
});

// ---------------------------------------------------------
// NUEVO: análisis motivador de la meta con IA (Gemini)
// ---------------------------------------------------------

const PROMPT_ANALISIS = `Sos un asistente financiero breve y motivador. Analizá esta meta de ahorro y escribí un mensaje corto (máximo 4 líneas) para el usuario.

Datos:
- Objetivo: {OBJETIVO}
- Monto objetivo: \${MONTO_OBJETIVO}
- Dinero que ya tiene: \${DINERO_INICIAL}
- Puede ahorrar por mes: \${AHORRO_MENSUAL}
- Plazo que quiere: {PLAZO_MESES} meses
- ¿Es alcanzable en ese plazo con ese ahorro?: {ES_ALCANZABLE}
- Tiempo real estimado con su ahorro actual: {MESES_ESTIMADOS} meses

Si es alcanzable, felicitalo y motivalo a mantener el ritmo.
Si NO es alcanzable, sé honesto pero alentador, y sugerí de forma breve qué podría ajustar (ahorrar un poco más por mes, o extender el plazo).
No repitas los números tal cual, hablá en tono cercano y humano, como un amigo que sabe de finanzas.

Respondé solo con el mensaje, sin títulos ni formato adicional.`;

app.post('/api/analizar', async (req, res) => {
  const { objetivo, montoObjetivo, dineroInicial, ahorroMensual, plazoMeses, plan } = req.body;

  if (
    typeof objetivo !== 'string' ||
    typeof montoObjetivo !== 'number' ||
    typeof dineroInicial !== 'number' ||
    typeof ahorroMensual !== 'number' ||
    typeof plazoMeses !== 'number' ||
    !plan
  ) {
    return res.status(400).json({ error: 'Faltan datos para analizar la meta.' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar la clave de IA (GEMINI_API_KEY) en el servidor.' });
  }

  const prompt = PROMPT_ANALISIS
    .replace('{OBJETIVO}', objetivo)
    .replace('{MONTO_OBJETIVO}', montoObjetivo)
    .replace('{DINERO_INICIAL}', dineroInicial)
    .replace('{AHORRO_MENSUAL}', ahorroMensual)
    .replace('{PLAZO_MESES}', plazoMeses)
    .replace('{ES_ALCANZABLE}', plan.esAlcanzable ? 'Sí' : 'No')
    .replace('{MESES_ESTIMADOS}', plan.mesesEstimados ?? 'desconocido');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error de Gemini:', errorBody);
      return res.status(502).json({ error: 'La IA no pudo generar el análisis. Probá de nuevo.' });
    }

    const data = await response.json();
    const mensajeIa = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    res.json({ mensaje: mensajeIa });
  } catch (error) {
    console.error('Error al conectar con la IA:', error);
    res.status(500).json({ error: 'Hubo un problema al conectar con la IA.' });
  }
});

// ---------------------------------------------------------
// NUEVO: metas guardadas para siempre + depósitos (Supabase)
// ---------------------------------------------------------

// Listar todas las metas, cada una con el total ya depositado
app.get('/api/metas', async (req, res) => {
  try {
    const respuesta = await supabaseFetch('metas?select=*,depositos(monto)&order=creado_en.desc');
    const metas = await respuesta.json();

    if (!respuesta.ok) {
      console.error('Error al listar metas:', metas);
      return res.status(502).json({ error: 'No se pudieron obtener las metas.' });
    }

    const metasConProgreso = metas.map((meta) => {
      const totalAhorrado = meta.dinero_inicial + meta.depositos.reduce((suma, d) => suma + Number(d.monto), 0);
      const plan = calcularPlan({
        montoObjetivo: Number(meta.monto_objetivo),
        dineroInicial: totalAhorrado,
        ahorroMensual: Number(meta.ahorro_mensual),
        plazoMeses: Number(meta.plazo_meses)
      });
      return {
        id: meta.id,
        nombre: meta.nombre,
        montoObjetivo: Number(meta.monto_objetivo),
        ahorroMensual: Number(meta.ahorro_mensual),
        plazoMeses: Number(meta.plazo_meses),
        totalAhorrado,
        plan
      };
    });

    res.json(metasConProgreso);
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    res.status(500).json({ error: 'Hubo un problema al conectar con la base de datos.' });
  }
});

// Crear una meta nueva
app.post('/api/metas', async (req, res) => {
  const { nombre, montoObjetivo, dineroInicial, ahorroMensual, plazoMeses } = req.body;

  if (
    typeof nombre !== 'string' ||
    typeof montoObjetivo !== 'number' ||
    typeof dineroInicial !== 'number' ||
    typeof ahorroMensual !== 'number' ||
    typeof plazoMeses !== 'number'
  ) {
    return res.status(400).json({ error: 'Faltan datos o tienen un formato inválido.' });
  }

  try {
    const respuesta = await supabaseFetch('metas', {
      method: 'POST',
      body: JSON.stringify({
        nombre,
        monto_objetivo: montoObjetivo,
        dinero_inicial: dineroInicial,
        ahorro_mensual: ahorroMensual,
        plazo_meses: plazoMeses
      })
    });

    const data = await respuesta.json();

    if (!respuesta.ok) {
      console.error('Error al crear meta:', data);
      return res.status(502).json({ error: 'No se pudo crear la meta.' });
    }

    res.json(data[0]);
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    res.status(500).json({ error: 'Hubo un problema al conectar con la base de datos.' });
  }
});

// Agregar un depósito a una meta existente
app.post('/api/metas/:id/depositos', async (req, res) => {
  const { id } = req.params;
  const { monto } = req.body;

  if (typeof monto !== 'number' || monto <= 0) {
    return res.status(400).json({ error: 'El monto tiene que ser un número mayor a 0.' });
  }

  try {
    const respuesta = await supabaseFetch('depositos', {
      method: 'POST',
      body: JSON.stringify({ meta_id: Number(id), monto })
    });

    const data = await respuesta.json();

    if (!respuesta.ok) {
      console.error('Error al agregar depósito:', data);
      return res.status(502).json({ error: 'No se pudo guardar el depósito.' });
    }

    res.json(data[0]);
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    res.status(500).json({ error: 'Hubo un problema al conectar con la base de datos.' });
  }
});

// Borrar una meta
app.delete('/api/metas/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const respuesta = await supabaseFetch(`metas?id=eq.${id}`, { method: 'DELETE' });

    if (!respuesta.ok) {
      const data = await respuesta.json();
      console.error('Error al borrar meta:', data);
      return res.status(502).json({ error: 'No se pudo borrar la meta.' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    res.status(500).json({ error: 'Hubo un problema al conectar con la base de datos.' });
  }
});

app.listen(PORT, () => {
  console.log(`App de ahorro corriendo en http://localhost:${PORT}`);
});
