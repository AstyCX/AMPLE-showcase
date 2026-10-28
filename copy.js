export const COPY = {
  page: {
    title: (name) => `${name} — an unseen amp from 8 numbers`,
    loadFailed: (message) => `The stand data could not be loaded (${message}). Please reload the page.`,
  },

  hero: {
    skip: 'Skip to the listening controls',
    pill: 'Research preview',
    stageLabel:
      '3D amp head. Its knobs show the selected measured setting; the knob controls below the amp do the same from ' +
      'the keyboard.',
  },

  nav: {
    label: 'Sections',
    how: 'How it works',
    results: 'Results',
    limits: 'Limits',
  },

  how: {
    title: 'How it works',
    lede:
      'A 21k-parameter neural network learns an amp it has never heard from 1–10 measured knob settings — through ' +
      'a characteristics card of 8 numbers for each specific amp. The research goal is to need as few measurements ' +
      'of a new amp as possible, by reusing what the network learned on other amps.',
    steps: [
      {
        title: 'Pretrain on 100 amps',
        text:
          'One small network (about 21k weights) learns 100 Guitarix amp heads at once. Every amp gets its own ' +
          "characteristics card: 8 numbers the network reads for the amp's specific sound next to the 6 knob values.",
      },
      {
        title: 'Measure an unseen amp',
        text:
          'Record a new amp at a few knob settings: N = 1, 3 or 10. Its tube or tonestack, or their combination, ' +
          'never appeared in training.',
      },
      {
        title: 'Fit only the card',
        text:
          '8 numbers that tell the pretrained network which amp to be. Only they are fit to the new amp; the ' +
          'network stays frozen. Then it plays knob settings it was never shown — here, 50 held-out test settings ' +
          'per amp.',
      },
    ],
  },

  results: {
    title: 'Results',
    lede:
      'Test error (ESR) of each method on the unseen amps, by the number of measured knob settings N it was given, ' +
      'over the whole 190 s test DI. The card is the main method of this project.',
    statLabel: 'ESR statistic',
    statGroup: 'Statistic',
    methodColumn: 'Method',
    nColumn: (n) => `N = ${n}`,
    caption: (stat, note) => `${stat} ESR by method and number of measured settings N. ${note}`,
    finding: ({ small, smallLo, smallHi, last, lastLo, lastHi }) =>
      `Main result: with ${small} the card and fine-tuning have a ${smallLo}–${smallHi}× lower error than the same ` +
      `network trained from scratch; with N = ${last} it is still ${lastLo}–${lastHi}×.`,
    lowerIsBetter: 'Lower ESR is better.',
    stats: {
      esr_median: {
        label: 'Median',
        note: ({ amps, settings }) =>
          `Main statistic: median over each amp's ${settings} test settings, averaged over ${amps} unseen amps.`,
      },
      esr_mean: {
        label: 'Mean',
        note: ({ amps, settings }) =>
          `Mean over ${amps} unseen amps × ${settings} test settings; a few near-silent or failed settings pull it up.`,
      },
      esr_pooled: {
        label: 'Pooled',
        note: ({ amps, settings }) =>
          `Error energy over signal energy pooled across each amp's ${settings} test settings, averaged over ` +
          `${amps} unseen amps.`,
      },
    },
    about: ({ takes }) =>
      `Each knob position plays the median test setting of that amp. The guitar is two looped Guitar-TECHS takes: ` +
      `${takes}. Level differences between the real amp and the model are kept, so you hear them too.`,
    aboutTake: ({ label, length, from }) => `${label} (${length} s from ${from})`,
  },

  limits: {
    title: 'Limits',
    items: [
      'All test amps are Guitarix heads: their tube or tonestack is unseen, but the simulator family is the same as ' +
        'for the 100 training amps.',
      'On other amp-plugin families the card does not transfer, and the pretrained base is not reliably better than ' +
        'training from scratch. Cross-family transfer is the open problem.',
      'The ESR next to the sound is measured on the played take; the table uses the standard 190 s test DI. The ' +
        'method ranking is the same on both, but two short takes are not a full test on new guitar recordings.',
      'The table is from one base run and one from-scratch run per cell. A second base seed gives a similar card ' +
        'error: mean ESR 0.038 / 0.036 / 0.035 vs 0.045 / 0.034 / 0.034 at N = 1 / 3 / 10.',
      'No formal blind listening test yet, so no claim that the model is indistinguishable by ear.',
      'Audio is the amp head without a speaker cabinet; Cab sim is a listening aid applied equally to every source.',
    ],
  },

  footer: {
    tagline: 'research preview, 2026',
    author: 'By Danila Miadzvedz · <a href="https://github.com/AstyCX">GitHub</a>',
    credits: {
      amps:
        'Amp sounds: <a href="https://guitarix.org">Guitarix</a> GxAmplifier-X (GPL), rendered offline; no Guitarix ' +
        'code ships here.',
      guitarStatic:
        'Guitar heard on this page: Guitar-TECHS dataset (Pedroza Villalobos, Taheri, Abreu, Corey, Roman, ICASSP ' +
        '2025), <a href="https://zenodo.org/records/14963133">zenodo.org/records/14963133</a>, licensed under ' +
        '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.',
      trainingDi:
        'Training and test DI behind the numbers: the standard reamp input <code>input.wav</code> of ' +
        '<a href="https://github.com/sdatkinson/neural-amp-modeler">Neural Amp Modeler</a>; not played on this page.',
      tech: '3D: <a href="https://threejs.org">three.js</a> (MIT). Font: Source Code Pro (SIL Open Font License).',
    },
    guitar: {
      before: (label) => `Guitar heard on this page: the ${label} DI recording (`,
      middle: (credit) => `) — ${credit}. Licensed under `,
      after: '. Changes: cut into two looped takes, level-adjusted, MP3-encoded, and rendered through the amps and models.',
    },
  },

  card: {
    title: 'What you hear',
    intro: 'Turn the knobs. Every position they snap to is a real measured test setting of an unseen amp.',
    listenTo: 'Listen to',
    realAmp: 'Real amp',
    model: 'Model',
    dryDi: 'Dry DI',
    take: 'Take',
    takeTitle: (label, length) => `${label}: ${length} s loop`,
    takeNote: (guitar) =>
      `Guitar: ${guitar || 'a DI recording'}, never heard by the network, neither in training nor in adaptation.`,
    amp: 'Amp',
    position: 'Position',
    method: 'Method',
    n: 'Measured settings N',
    listenNote: {
      real: (amp) => `Guitarix recording of ${amp} at this setting.`,
      di: 'The dry guitar alone, before any amp: the Guitar-TECHS recording itself.',
      model: (method, n, amp) => `${method}, N = ${n}: the network's version of ${amp}.`,
    },
    cardLeaves: ' The brass leaves on the grille show its card.',
    readoutLabel: 'Readout of the selected model on this setting',
    who: ({ method, n, amp, position, take }) => `${method} · N = ${n} · ${amp} · ${position} · ${take}`,
    esrLabel: 'ESR on this take',
    esrInfo: 'What is ESR?',
    levelLabel: 'Level vs real amp, this take',
    loading: (loaded, total) => `Loading sounds ${loaded}/${total}`,
    blindButton: 'Blind test',
    blindButtonSub: 'Which one is the real amp?',
  },

  esr:
    "Error-to-signal ratio: the error's energy divided by the real amp's. 0 is identical, 1 means the error is as " +
    'loud as the amp. Measured on the take you hear; the Results table below uses the whole 190 s test DI, so its ' +
    'numbers differ a little.',

  methods: {
    card: 'Fit only the 8 numbers (2000 steps).',
    finetune: 'Fit all ~21k weights from the pretrained base (2000 steps).',
    nearest: 'No fitting: borrow the closest of the 100 training amps.',
    scratch: 'Same network, random start, 30 000 steps, no pretraining.',
  },

  ampName: (letter) => `Amp ${letter}`,

  blind: {
    title: 'Blind test',
    play: 'Play',
    question: 'Which one is the real amp?',
    answer: (x) => `${x} is real`,
    next: 'Next round',
    last: 'See the result',
    again: 'Play again',
    exit: 'Exit',
    keys: 'Keyboard: X switches A and B, Space plays or pauses.',
    progress: (round, total, score, answered) => `Round ${round} / ${total} · Score ${score} / ${answered}`,
    final: (score, total) => `Score ${score} / ${total}`,
    where: (amp, position) => `${amp} · ${position}. One of A and B is the real amp, the other a model output.`,
    loading: 'Loading round…',
    loadingCount: (loaded, total) => `Loading round… ${loaded}/${total}`,
    right: 'Right.',
    wrong: 'Not this time.',
    wasReal: (x) => ` ${x} was the real amp.`,
    revealModel: (other, method, n) => `${other} was ${method}, N = ${n}, with ESR `,
    revealTake: ' on this take.',
    summaryScore: ' rounds you picked the real amp.',
    chance: 'Chance alone gives about 5 / 10. A low ESR does not promise that the difference is inaudible.',
    rowModel: (amp, position, method, n) => `${amp}, ${position}: ${method}, N = ${n}, ESR `,
    rowTake: ' on this take',
    missed: ' (missed)',
  },

  knobs: {
    title: 'Amp knobs',
    group: 'Amp knobs',
    valueText: (knob, value, position) => `${knob} ${value}${position ? `, measured setting: ${position.toLowerCase()}` : ''}`,
    snapHint: 'Only measured settings are playable — the knobs snap to the nearest one.',
    measured: (position) => `Measured setting: ${position}`,
  },

  transport: {
    group: 'Playback',
    play: 'Play',
    pause: 'Pause',
    volume: 'Volume',
    cab: 'Cab sim',
    cabAbout: 'About Cab sim',
    cabTip:
      'A speaker-cabinet filter as a listening aid, the same for every source. The recordings are the amp head ' +
      'alone, without a cabinet.',
  },

  dock: {
    group: 'Quick playback',
    real: 'Real',
    model: 'Model',
    esr: 'Take ESR',
    esrTitle: 'ESR on this take',
  },

  audio: {
    unavailable: 'Audio is not available in this browser.',
    problem: (message) => `Audio problem: ${message}`,
    playFailed: 'Audio problem: the sound could not be played. Try again or reload.',
    silentSwitch: 'No sound? Check that the silent switch is off.',
  },

  announce: {
    measured: (position, amp) => `Measured setting: ${position}, ${amp}.`,
    take: (take) => `Take: ${take}.`,
    real: 'Listening to the real amp.',
    di: 'Listening to the dry DI.',
    model: (method, n) => `Listening to the model: ${method}, N = ${n}.`,
    blindStart: (total, amp, position) =>
      `Blind test, round 1 of ${total}: ${amp}, ${position}. Switch between A and B, then say which one is the real amp.`,
    blindRound: (round, total, amp, position) => `Round ${round} of ${total}: ${amp}, ${position}.`,
    blindPlaying: ' Playing A.',
    blindAnswer: ({ correct, real, other, method, n, takeEsr, score, answered }) =>
      `${correct ? 'Right' : 'Not this time'}: ${real} was the real amp. ${other} was ${method}, N = ${n}, ESR ` +
      `${takeEsr} on this take. Score ${score} of ${answered}.`,
    blindDone: (score, total) => `Blind test done: ${score} of ${total}.`,
    blindClosed: 'Blind test closed.',
  },

  amp: {
    jewels: ['MOD', 'HIGH', 'EXTR'],
    input: 'INPUT',
    power: 'POWER',
    on: 'ON',
    off: 'OFF',
  },
};
