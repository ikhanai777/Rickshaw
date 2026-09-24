# Rickshaw Wala — رکشہ والا

A 3D auto-rickshaw driving game set in the streets of Lahore, built with [three.js](https://threejs.org/).
Everything — the city, vehicles, people, textures and sound — is generated procedurally in the browser,
so there are no asset downloads beyond three.js and two Google Fonts.

## Play

It's a static site with no build step. Serve the folder with any web server and open `index.html`:

```bash
npx http-server -p 8080 .    # or: python3 -m http.server 8080
```

Then open <http://localhost:8080>. (Opening the file directly via `file://` won't work, because ES modules need a server.)

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `H` | Horn (hold) |
| `Space` | Handbrake |
| `C` | Camera: chase / driver's seat / high |
| `T` | Time of day: afternoon / golden hour / night / smoggy morning |
| `R` | Put the rickshaw back on the road |
| `M` | Mute |
| `P` / `Esc` | Pause |

On phones and tablets, on-screen buttons appear once you start.

## Gameplay

- **Sawari (passengers)** wave from the footpath and are marked with green rings and a green arrow on the minimap.
  Stop next to one to pick them up.
- Drive to the **golden beam of light**. The floating arrow above the rickshaw points the way.
  Stop there to drop them off and get paid in rupees.
- Fast, smooth rides earn tips. Crashes, flying over speed breakers and running people off the footpath
  cost you part of the fare and your star rating (plus a Rs 200 *chalan* for bumping a pedestrian).
- The rickshaw runs on **CNG**. When the tank runs low, refuel at the CNG station (the blue dot on the minimap)
  by stopping under the canopy.

## What's in the city

- Dense shop-houses with rolling shutters, Urdu/English panaflex signboards, awnings, balconies with laundry,
  AC units, black water tanks, rebar sticking out of unfinished roofs, and exposed brick side walls
- Concrete electric poles with tangled overhead wires, transformers and street lights
- Main roads with black-and-yellow painted medians, zebra crossings, potholes and speed breakers
- Minar-e-Pakistan in a park, a Mughal-style red-sandstone mosque, a CNG station, and bazaars
  strung with green-and-white flag bunting
- Left-hand traffic: Corolla-style sedans, Mehran-style hatchbacks, Bolan vans, Ravi pickups,
  truck-art buses, CD70 motorbikes (often carrying a pillion rider) and other rickshaws.
  They turn at the *chowks*, swerve around anything stopped in their lane, and use the horn a lot.
- Pedestrians in shalwar kameez, dupattas and burqas who jump out of your way, plus fruit-cart vendors
- Kites and cheel birds overhead, dust in the air, and four lighting presets including a sodium-lit night

## Code layout

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, HUD markup and styles, import map for three.js |
| `src/main.js` | Renderer, sky, lighting presets, camera, input and main loop |
| `src/city.js` | Procedural city generation, landmarks and static collision |
| `src/rickshaw.js` | Rickshaw model and the player's three-wheeler physics |
| `src/traffic.js` | Lane-following AI traffic with junction turns, lane changes and honking |
| `src/vehicles.js` | Car, van, pickup, bus and motorbike models |
| `src/people.js` | Animated pedestrians, riders and static crowds |
| `src/missions.js` | Passenger pickups, fares, ratings and dialogue |
| `src/hud.js` | Speedometer, minimap, fare panel and toasts |
| `src/audio.js` | WebAudio synthesis for the engine, horns and effects |
| `src/textures.js` | Canvas-painted textures: asphalt, facades, shopfronts, signs, truck art |
| `src/builder.js` | Geometry batching into per-chunk merged meshes |
