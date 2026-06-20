interface CharacterVideoConfig {
  idle: string;
  speaking: string;
}

const videoMap: Record<string, CharacterVideoConfig> = {
  agenda: { idle: '/videos/agenda_idle.mp4', speaking: '' },
  alien: { idle: '/videos/alien_idle.mp4', speaking: '' },
  battito: { idle: '/videos/battito_idle.mp4', speaking: '/videos/battito_speaking.mp4' },
  bella: { idle: '/videos/bella_idle.mp4', speaking: '/videos/bella_speaking.mp4' },
  borsa: { idle: '/videos/borsa_idle.mp4', speaking: '/videos/borsa_speaking.mp4' },
  coniglio: { idle: '/videos/coniglio_idle.mp4', speaking: '/videos/coniglio_speaking.mp4' },
  corvo: { idle: '/videos/corvo_idle.mp4', speaking: '/videos/corvo_speaking.mp4' },
  costruttore: { idle: '/videos/costruttore_idle.mp4', speaking: '/videos/costruttore_speaking.mp4' },
  cucita: { idle: '/videos/cucita_idle.mp4', speaking: '/videos/cucita_speaking.mp4' },
  cuoco: { idle: '/videos/cuoco_idle.mp4', speaking: '/videos/cuoco_speaking.mp4' },
  delfino: { idle: '/videos/delfino_idle.mp4', speaking: '/videos/delfino_speaking.mp4' },
  dottore: { idle: '/videos/dottore_idle.mp4', speaking: '/videos/dottore_speaking.mp4' },
  drago: { idle: '/videos/drago_idle.mp4', speaking: '/videos/drago_speaking.mp4' },
  dragon: { idle: '/videos/dragon_idle.mp4', speaking: '' },
  fraggl: { idle: '/videos/fraggl_idle.mp4', speaking: '' },
  grouch: { idle: '/videos/grouch_idle.mp4', speaking: '' },
  elefante: { idle: '/videos/elefante_idle.mp4', speaking: '/videos/elefante_speaking.mp4' },
  forza: { idle: '/videos/forza_idle.mp4', speaking: '/videos/forza_speaking.mp4' },
  gufo: { idle: '/videos/gufo_idle.mp4', speaking: '/videos/gufo_speaking.mp4' },
  jack: { idle: '/videos/jack_idle.mp4', speaking: '/videos/jack_speaking.mp4' },
  leone: { idle: '/videos/leone_idle.mp4', speaking: '/videos/leone_speaking.mp4' },
  lucha_bee: { idle: '/videos/lucha_bee_idle.mp4', speaking: '' },
  maestra: { idle: '/videos/maestra_idle.mp4', speaking: '/videos/maestra_speaking.mp4' },
  mamma: { idle: '/videos/mamma_idle.mp4', speaking: '/videos/mamma_speaking.mp4' },
  ninja_cat: { idle: '/videos/ninja_cat_idle.mp4', speaking: '' },
  nonna: { idle: '/videos/nonna_idle.mp4', speaking: '/videos/nonna_speaking.mp4' },
  onda: { idle: '/videos/onda_idle.mp4', speaking: '/videos/onda_speaking.mp4' },
  orsetto: { idle: '/videos/orsetto_idle.mp4', speaking: '/videos/orsetto_speaking.mp4' },
  papa: { idle: '/videos/papa_idle.mp4', speaking: '' },
  pietro: { idle: '/videos/pietro_idle.mp4', speaking: '/videos/pietro_speaking.mp4' },
  pirate_parrot: { idle: '/videos/pirate_parrot_idle.mp4', speaking: '' },
  polpo: { idle: '/videos/polpo_idle.mp4', speaking: '/videos/polpo_speaking.mp4' },
  ragno: { idle: '/videos/ragno_idle.mp4', speaking: '/videos/ragno_speaking.mp4' },
  rocco: { idle: '/videos/rocco_idle.mp4', speaking: '/videos/rocco_speaking.mp4' },
  sacco: { idle: '/videos/sacco_idle.mp4', speaking: '/videos/sacco_speaking.mp4' },
  scheletro: { idle: '/videos/scheletro_idle.mp4', speaking: '/videos/scheletro_speaking.mp4' },
  spugna: { idle: '/videos/spugna_idle.mp4', speaking: '/videos/spugna_speaking.mp4' },
  tartaruga: { idle: '/videos/tartaruga_idle.mp4', speaking: '/videos/tartaruga_speaking.mp4' },
  transformer_bot: { idle: '/videos/transformer_bot_idle.mp4', speaking: '' },
  trex: { idle: '/videos/trex_idle.mp4', speaking: '' },
  veloce: { idle: '/videos/veloce_idle.mp4', speaking: '/videos/veloce_speaking.mp4' },
  verita: { idle: '/videos/verita_idle.mp4', speaking: '/videos/verita_speaking.mp4' },
  volpe: { idle: '/videos/volpe_idle.mp4', speaking: '/videos/volpe_speaking.mp4' },
};

export function getCharacterVideos(slug: string): { idle: string | null; speaking: string | null } {
  const config = videoMap[slug];
  if (!config) return { idle: null, speaking: null };
  // If a speaking variant is missing, fall back to the idle loop so the avatar never blanks out.
  return { idle: config.idle, speaking: config.speaking || config.idle };
}
