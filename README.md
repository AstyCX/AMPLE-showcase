<p align="center">
  <img src="preview.png" alt="AMPLE: 3D amp head with brass knobs" width="720">
</p>

<h1 align="center">AMPLE</h1>
<p align="center"><b>Amplifier Modeling from Prior-Learned Embeddings</b><br>
An unseen guitar amp from 1–10 measured knob settings.</p>

<p align="center">
  <a href="https://astycx.github.io/AMPLE-showcase/"><b>▶ Open the live demo</b></a>
</p>

> [!NOTE]
> Research preview, 2026. Results hold within one simulator family (Guitarix).

<p align="center">
  Project Goal: to learn a new amp from the fewest knob measurements possible by pre-training the model on multiple amp sims.
</p>

## Contents
- [What you can do](#what-you-can-do)
- [How it works](#how-it-works)
- [Methods compared](#methods-compared)
- [Results](#results)
- [Limits](#limits)
- [Current repo](#current-repo)
- [Run locally](#run-locally)
- [Acknowledgements](#acknowledgements)
- [Contact](#contact)

## What you can do
- Turn the knobs of a 3D amp, which snap only to the pre-measured test settings
- Switch between the real amp (Guitarix), the model and the dry DI
- Take a blind test: which one is the real amp?

## How it works
1. **Pretrain on 100 amps**: each amp gets its own card with 8 values (the embedding card). For each amplifier we pass the input DI through it at 200 knob settings (4-second excerpts of the DI each), and the network learns to turn the DI and the knob values into the amp's output.

   <details><summary><bold>Network and training</bold></summary>

   The network is a WaveNet with embeddings and FiLM conditioning on the knob values and the embedding. The result of the learning process is a small network of about 21k weights. The training loss is the waveform error (MSE) plus a spectral (log-mel) error; ESR is used to evaluate the results.

   </details>

2. **Measure an unseen amp**: an amp unseen during training is measured at a certain number of knob settings (N).
3. **Adjusting:** by adjusting the network according to one of the project methods (listed in the next chapter), we get the final simulation for the unseen amp (the main method is card fitting).

## Methods compared
All 4 get the same N measured knob settings of the new amp:
- **Card** (main project method): all the weights are frozen, and only the embedding card, which specifies the amp's characteristics and describes its sound, is learned (2000 steps)
- **Fine-tune**: all weights are fit, starting from the pre-trained network (2000 steps)
- **Nearest known amp**: nothing is trained; the closest of the 100 learned amps is chosen
- **From scratch**: the same network is trained from scratch (on the same N settings, 30000 steps)

## Results
> [!TIP]
> **ESR** — the error's energy relative to the real amp's sound. 0 is identical; lower is better.

**Main result:** with N = 1 and 3, the card and fine-tuning have a 14–26× lower error than the same network trained from scratch; with N = 10 it is still 7–9×.

| Method | N = 1 | N = 3 | N = 10 |
|---|---:|---:|---:|
| Nearest known amp | 0.104 | 0.0931 | 0.0931 |
| **Card** | **0.0340** | **0.0261** | **0.0256** |
| Fine-tune | 0.0495 | 0.0349 | 0.0197 |
| From scratch | 0.735 | 0.686 | 0.181 |

<sub>Median ESR over each amp's 50 test settings, averaged over 5 unseen amps; lower is better.</sub>

<details><summary>Mean and pooled ESR</summary>

**Mean** over 5 unseen amps × 50 test settings (a few near-silent or failed settings pull it up):

| Method | N = 1 | N = 3 | N = 10 |
|---|---:|---:|---:|
| Nearest known amp | 0.114 | 0.105 | 0.105 |
| **Card** | **0.0448** | **0.0343** | **0.0337** |
| Fine-tune | 0.0648 | 0.0469 | 0.0295 |
| From scratch | 2.17 | 2.78 | 0.323 |

**Pooled**: error energy over signal energy across each amp's 50 test settings, averaged over 5 unseen amps:

| Method | N = 1 | N = 3 | N = 10 |
|---|---:|---:|---:|
| Nearest known amp | 0.123 | 0.113 | 0.113 |
| **Card** | **0.0580** | **0.0481** | **0.0467** |
| Fine-tune | 0.0707 | 0.0592 | 0.0390 |
| From scratch | 0.766 | 0.770 | 0.267 |

</details>

## Limits
- All amplifiers the model is trained on are from the Guitarix family. As of today, the network is unable to reliably simulate an unseen amp family and is not reliably better than training from scratch. Therefore the current goal is to solve the multi-family model transfer.
- Only one seed for the base & one more to test the reliability. More seeds to be tested in the future.
- No blind human test conducted yet.
- Amp sim is just a head without a cabinet (on the showcase page, an optional cab filter can be switched on to simulate the cabinet effect).

## Current repo
This repo contains the demo page and the data it needs.
There is **no** model code, no weights and no training data. These may be added at a later research stage.

## Run locally
```bash
python3 -m http.server 8000
```
Then open <http://localhost:8000>. A browser with WebGL is needed for the 3D amp (without it, the page shows a flat 2D panel).

## Acknowledgements
- **Amp sounds:** [Guitarix](https://guitarix.org) GxAmplifier-X (GPL), rendered offline; no Guitarix code is included here.
- **Guitar recording:** Guitar-TECHS, player 03, Telecaster — Pedroza Villalobos, Taheri, Abreu, Corey, Roman: *Guitar-TECHS: An Electric Guitar Dataset Covering Techniques, Musical Excerpts, Chords and Scales Using a Diverse Array of Hardware*, ICASSP 2025, [doi:10.1109/ICASSP49660.2025.10887996](https://doi.org/10.1109/ICASSP49660.2025.10887996). Data: [zenodo.org/records/14963133](https://zenodo.org/records/14963133), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: two excerpts cut and looped, level-adjusted, rendered through the amps and models, MP3-encoded.
- **Training and test DI:** the standard reamp input `input.wav` of [Neural Amp Modeler](https://github.com/sdatkinson/neural-amp-modeler) (not included in this repo).
- **3D:** [three.js](https://threejs.org) (MIT). **Font:** Source Code Pro (SIL Open Font License).

## Contact
Danila Miadzvedz · danila.miadzvedz.stud@pw.edu.pl · [LinkedIn](https://www.linkedin.com/in/danila-miadzvedz/) · [GitHub](https://github.com/AstyCX)
