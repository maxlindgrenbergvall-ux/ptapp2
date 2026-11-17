"""
Utförandesteg (v60) för övningsbankens rörelsemönster – tre steg per mönster
(Utgångsläge, Rörelse, Kontroll/Andning) på sv, en, es, fr, de.

Kör:  python3 scripts/guide-steps.py
Skriver om blocket `guide: {…}` i src/lib/i18n/dictionaries/*.ts.
"""
import re
from pathlib import Path

LANGS = ["sv", "en", "es", "fr", "de"]

# Rubriker och knappar.
UI = {
    "title": ["Videoguide / Utförande", "Video guide / Technique", "Videoguía / Técnica", "Guide vidéo / Exécution", "Videoanleitung / Ausführung"],
    "start": ["Utgångsläge", "Starting position", "Posición inicial", "Position de départ", "Ausgangsposition"],
    "move": ["Rörelse", "Movement", "Movimiento", "Mouvement", "Bewegung"],
    "control": ["Kontroll / andning", "Control / breathing", "Control / respiración", "Contrôle / respiration", "Kontrolle / Atmung"],
    "show": ["Visa videoguide för {name}", "Show video guide for {name}", "Ver videoguía de {name}", "Voir le guide vidéo de {name}", "Videoanleitung für {name} zeigen"],
    "hide": ["Dölj videoguiden", "Hide video guide", "Ocultar videoguía", "Masquer le guide vidéo", "Videoanleitung ausblenden"],
    "animation": ["Animerad guide", "Animated guide", "Guía animada", "Guide animé", "Animierte Anleitung"],
    "video": ["Videoguide", "Video guide", "Videoguía", "Guide vidéo", "Videoanleitung"],
}

S = {
    # ------------------------------------------------------------- ben ---
    "squat": [
        ["Stången på övre ryggen, fötterna axelbrett.", "Böj knän och höft, sitt ned mellan hälarna.", "Andas in och spänn magen, andas ut uppe."],
        ["Bar on your upper back, feet shoulder-width.", "Bend knees and hips, sit down between your heels.", "Breathe in and brace, exhale at the top."],
        ["Barra en la parte alta de la espalda, pies al ancho de hombros.", "Flexiona rodillas y cadera, baja entre los talones.", "Inspira y aprieta el core, espira arriba."],
        ["Barre sur le haut du dos, pieds largeur d'épaules.", "Fléchis genoux et hanches, descends entre les talons.", "Inspire et gaine, expire en haut."],
        ["Stange auf dem oberen Rücken, Füße schulterbreit.", "Knie und Hüfte beugen, zwischen die Fersen setzen.", "Einatmen und Rumpf anspannen, oben ausatmen."],
    ],
    "front_squat": [
        ["Stången vilar framför axlarna, armbågarna högt.", "Sitt rakt ned med upprätt överkropp.", "Håll armbågarna uppe, andas ut på vägen upp."],
        ["Bar rests in front of your shoulders, elbows high.", "Sit straight down with an upright torso.", "Keep elbows up, exhale on the way up."],
        ["Barra apoyada delante de los hombros, codos altos.", "Baja recto con el torso erguido.", "Mantén los codos arriba, espira al subir."],
        ["Barre posée devant les épaules, coudes hauts.", "Descends droit, buste vertical.", "Garde les coudes hauts, expire en remontant."],
        ["Stange vor den Schultern, Ellbogen hoch.", "Gerade nach unten setzen, Oberkörper aufrecht.", "Ellbogen oben halten, beim Hochkommen ausatmen."],
    ],
    "goblet": [
        ["Vikten mot bröstet, fötterna lite utåtvridna.", "Sitt djupt mellan knäna med rak rygg.", "Tryck upp genom hela foten, andas ut uppe."],
        ["Weight against your chest, toes slightly out.", "Sit deep between your knees with a straight back.", "Drive up through the whole foot, exhale at the top."],
        ["Peso contra el pecho, puntas algo abiertas.", "Baja profundo entre las rodillas, espalda recta.", "Empuja con todo el pie, espira arriba."],
        ["Charge contre la poitrine, pointes légèrement ouvertes.", "Descends profond entre les genoux, dos droit.", "Pousse avec tout le pied, expire en haut."],
        ["Gewicht vor der Brust, Fußspitzen leicht nach außen.", "Tief zwischen die Knie setzen, Rücken gerade.", "Über den ganzen Fuß hochdrücken, oben ausatmen."],
    ],
    "machine_squat": [
        ["Ryggen mot dynan, fötterna mitt på plattan.", "Böj knäna kontrollerat till minst 90 grader.", "Lås inte knäna uppe, andas ut när du pressar."],
        ["Back against the pad, feet mid-platform.", "Bend your knees under control to at least 90 degrees.", "Don't lock your knees at the top, exhale as you press."],
        ["Espalda contra el respaldo, pies en el centro.", "Flexiona las rodillas con control hasta 90 grados.", "No bloquees las rodillas arriba, espira al empujar."],
        ["Dos contre le dossier, pieds au milieu du plateau.", "Fléchis les genoux avec contrôle jusqu'à 90°.", "Ne verrouille pas les genoux, expire en poussant."],
        ["Rücken am Polster, Füße mittig auf der Platte.", "Knie kontrolliert auf mindestens 90 Grad beugen.", "Knie oben nicht durchstrecken, beim Drücken ausatmen."],
    ],
    "leg_press": [
        ["Ryggen och höften mot sätet, fötterna axelbrett.", "Sänk plattan tills knäna är runt 90 grader.", "Tryck genom hälarna, lås inte knäna."],
        ["Back and hips against the seat, feet shoulder-width.", "Lower the sled until your knees are about 90 degrees.", "Push through your heels, don't lock your knees."],
        ["Espalda y cadera pegadas al asiento, pies al ancho de hombros.", "Baja la plataforma hasta unos 90 grados de rodilla.", "Empuja con los talones, sin bloquear rodillas."],
        ["Dos et bassin collés au siège, pieds largeur d'épaules.", "Descends le plateau jusqu'à environ 90° aux genoux.", "Pousse dans les talons, sans verrouiller."],
        ["Rücken und Hüfte am Sitz, Füße schulterbreit.", "Plattform senken, bis die Knie etwa 90 Grad haben.", "Über die Fersen drücken, Knie nicht durchstrecken."],
    ],
    "split_squat": [
        ["Bakre foten på bänken, främre foten ett långt steg fram.", "Sänk höften rakt ned tills bakre knät nästan når golvet.", "Vikten på främre foten, andas ut uppåt."],
        ["Rear foot on the bench, front foot a long step ahead.", "Lower your hips straight down until the back knee nearly touches.", "Weight on the front foot, exhale on the way up."],
        ["Pie trasero en el banco, delantero un paso largo por delante.", "Baja la cadera recto hasta casi tocar con la rodilla.", "Peso en el pie delantero, espira al subir."],
        ["Pied arrière sur le banc, pied avant un grand pas devant.", "Descends le bassin jusqu'à frôler le sol du genou.", "Poids sur le pied avant, expire en montant."],
        ["Hinterer Fuß auf der Bank, vorderer einen großen Schritt vor.", "Hüfte gerade senken, bis das hintere Knie fast den Boden berührt.", "Gewicht auf dem vorderen Fuß, hoch ausatmen."],
    ],
    "lunge": [
        ["Stå rakt med vikterna längs sidorna.", "Ta ett långt steg och sänk bakre knät mot golvet.", "Främre knät över foten, andas ut när du trycker ifrån."],
        ["Stand tall with the weights at your sides.", "Take a long step and lower the back knee toward the floor.", "Front knee over the foot, exhale as you push off."],
        ["De pie, pesas a los lados.", "Da un paso largo y baja la rodilla trasera al suelo.", "Rodilla delantera sobre el pie, espira al empujar."],
        ["Debout, charges le long du corps.", "Fais un grand pas et descends le genou arrière vers le sol.", "Genou avant au-dessus du pied, expire en repoussant."],
        ["Aufrecht stehen, Gewichte seitlich.", "Großen Schritt machen, hinteres Knie Richtung Boden senken.", "Vorderes Knie über dem Fuß, beim Abdrücken ausatmen."],
    ],
    "step_up": [
        ["Hela foten på lådan, vikterna längs sidorna.", "Kliv upp genom främre benet tills du står rak.", "Gå ned kontrollerat, andas ut på vägen upp."],
        ["Whole foot on the box, weights at your sides.", "Step up through the front leg until you stand tall.", "Step down under control, exhale on the way up."],
        ["Todo el pie en el cajón, pesas a los lados.", "Sube con la pierna delantera hasta quedar erguido.", "Baja con control, espira al subir."],
        ["Tout le pied sur la box, charges le long du corps.", "Monte avec la jambe avant jusqu'à être debout.", "Redescends avec contrôle, expire en montant."],
        ["Ganzer Fuß auf der Box, Gewichte seitlich.", "Über das vordere Bein hochsteigen, bis du aufrecht stehst.", "Kontrolliert absteigen, beim Hochsteigen ausatmen."],
    ],
    "leg_ext": [
        ["Knäna i linje med maskinens axel, ryggen mot dynan.", "Sträck benen tills de är raka.", "Sänk långsamt, andas ut när du sträcker."],
        ["Knees in line with the machine's pivot, back against the pad.", "Extend your legs until they are straight.", "Lower slowly, exhale as you extend."],
        ["Rodillas alineadas con el eje, espalda apoyada.", "Extiende las piernas hasta estirarlas.", "Baja lento, espira al extender."],
        ["Genoux alignés avec l'axe, dos contre le dossier.", "Tends les jambes jusqu'à l'extension.", "Redescends lentement, expire en tendant."],
        ["Knie auf Höhe der Maschinenachse, Rücken am Polster.", "Beine strecken, bis sie gerade sind.", "Langsam absenken, beim Strecken ausatmen."],
    ],
    "pistol": [
        ["Stå på ett ben, armarna framåt.", "Sitt ned på ett ben med det andra benet rakt fram.", "Håll balansen, andas ut när du reser dig."],
        ["Stand on one leg, arms forward.", "Squat down on one leg with the other leg straight ahead.", "Keep your balance, exhale as you stand up."],
        ["Sobre una pierna, brazos al frente.", "Baja sobre una pierna con la otra estirada delante.", "Mantén el equilibrio, espira al subir."],
        ["Sur une jambe, bras devant.", "Descends sur une jambe, l'autre tendue devant.", "Garde l'équilibre, expire en remontant."],
        ["Auf einem Bein stehen, Arme nach vorn.", "Einbeinig in die Hocke, anderes Bein gestreckt vorn.", "Gleichgewicht halten, beim Aufstehen ausatmen."],
    ],
    "wall_sit": [
        ["Ryggen mot väggen, fötterna en bit fram.", "Glid ned tills knäna är i 90 grader och håll.", "Andas lugnt, tryck ländryggen mot väggen."],
        ["Back against the wall, feet a little forward.", "Slide down until your knees are at 90 degrees and hold.", "Breathe calmly, press your lower back into the wall."],
        ["Espalda contra la pared, pies algo adelantados.", "Baja hasta 90 grados de rodilla y aguanta.", "Respira tranquilo, lumbar pegada a la pared."],
        ["Dos contre le mur, pieds un peu devant.", "Descends jusqu'à 90° aux genoux et tiens.", "Respire calmement, bas du dos contre le mur."],
        ["Rücken an der Wand, Füße etwas vor.", "Bis 90 Grad Kniewinkel hinunterrutschen und halten.", "Ruhig atmen, unteren Rücken an die Wand drücken."],
    ],
    "rdl": [
        ["Stå med vikten framför låren, lätt böjda knän.", "Skjut höften bakåt och för vikten längs benen.", "Rak rygg, känn baksidan sträckas, andas ut uppe."],
        ["Stand with the weight in front of your thighs, soft knees.", "Push your hips back and slide the weight down your legs.", "Flat back, feel the hamstrings stretch, exhale at the top."],
        ["De pie con el peso delante de los muslos, rodillas suaves.", "Lleva la cadera atrás y baja el peso pegado a las piernas.", "Espalda recta, nota el isquio, espira arriba."],
        ["Debout, charge devant les cuisses, genoux souples.", "Recule les hanches et descends la charge le long des jambes.", "Dos plat, sens les ischios, expire en haut."],
        ["Stehen, Gewicht vor den Oberschenkeln, Knie leicht gebeugt.", "Hüfte nach hinten schieben, Gewicht an den Beinen entlang senken.", "Rücken gerade, Dehnung hinten spüren, oben ausatmen."],
    ],
    "good_morning": [
        ["Stången på övre ryggen, lätt böjda knän.", "Fäll överkroppen framåt genom att skjuta höften bakåt.", "Rak rygg hela vägen, andas ut när du reser dig."],
        ["Bar on your upper back, soft knees.", "Hinge forward by pushing your hips back.", "Flat back all the way, exhale as you stand up."],
        ["Barra en la espalda alta, rodillas suaves.", "Inclina el torso llevando la cadera atrás.", "Espalda recta todo el rato, espira al subir."],
        ["Barre sur le haut du dos, genoux souples.", "Penche le buste en reculant les hanches.", "Dos plat tout du long, expire en te relevant."],
        ["Stange auf dem oberen Rücken, Knie leicht gebeugt.", "Oberkörper durch Hüfte nach hinten vorbeugen.", "Rücken durchgehend gerade, beim Aufrichten ausatmen."],
    ],
    "hip_thrust": [
        ["Övre ryggen mot bänken, vikten över höften.", "Pressa höften upp tills kroppen är rak från knä till axel.", "Knip sätet i toppen, andas ut uppåt."],
        ["Upper back on the bench, weight across your hips.", "Drive your hips up until knees to shoulders form a line.", "Squeeze your glutes at the top, exhale on the way up."],
        ["Espalda alta en el banco, peso sobre la cadera.", "Sube la cadera hasta alinear rodillas y hombros.", "Aprieta glúteos arriba, espira al subir."],
        ["Haut du dos sur le banc, charge sur les hanches.", "Monte le bassin jusqu'à aligner genoux et épaules.", "Serre les fessiers en haut, expire en montant."],
        ["Oberer Rücken auf der Bank, Gewicht auf der Hüfte.", "Hüfte hochdrücken, bis Knie und Schultern eine Linie bilden.", "Gesäß oben anspannen, hoch ausatmen."],
    ],
    "glute_bridge": [
        ["Ligg på rygg, knäna böjda, fötterna i golvet.", "Lyft höften tills kroppen är rak från knä till axel.", "Knip sätet i toppen, sänk långsamt."],
        ["Lie on your back, knees bent, feet on the floor.", "Lift your hips until knees to shoulders form a line.", "Squeeze your glutes at the top, lower slowly."],
        ["Boca arriba, rodillas flexionadas, pies en el suelo.", "Eleva la cadera hasta alinear rodillas y hombros.", "Aprieta glúteos arriba, baja despacio."],
        ["Sur le dos, genoux fléchis, pieds au sol.", "Monte le bassin jusqu'à aligner genoux et épaules.", "Serre les fessiers, redescends lentement."],
        ["Rückenlage, Knie gebeugt, Füße am Boden.", "Hüfte heben, bis Knie und Schultern eine Linie bilden.", "Oben Gesäß anspannen, langsam senken."],
    ],
    "leg_curl": [
        ["Dynan strax ovanför hälarna, knäna vid maskinens axel.", "Böj knäna och dra hälarna mot sätet.", "Sänk långsamt, håll höften i dynan."],
        ["Pad just above your heels, knees at the machine's pivot.", "Bend your knees and pull your heels toward your glutes.", "Lower slowly, keep your hips on the pad."],
        ["Rodillo sobre los talones, rodillas en el eje.", "Flexiona y lleva los talones hacia el glúteo.", "Baja lento, cadera pegada al banco."],
        ["Boudin au-dessus des talons, genoux à l'axe.", "Fléchis et ramène les talons vers les fessiers.", "Redescends lentement, bassin collé."],
        ["Polster knapp über den Fersen, Knie an der Achse.", "Knie beugen, Fersen Richtung Gesäß ziehen.", "Langsam ablassen, Hüfte am Polster."],
    ],
    "nordic": [
        ["På knä med fötterna fastlåsta, rak kropp.", "Fäll dig långsamt framåt så länge du orkar bromsa.", "Ta emot med händerna, andas jämnt."],
        ["Kneel with your feet anchored, body straight.", "Lower yourself forward as slowly as you can control.", "Catch yourself with your hands, breathe steadily."],
        ["De rodillas con los pies fijos, cuerpo recto.", "Déjate caer adelante lo más lento que puedas frenar.", "Recógete con las manos, respira constante."],
        ["À genoux, pieds bloqués, corps droit.", "Descends vers l'avant le plus lentement possible.", "Rattrape-toi avec les mains, respire régulièrement."],
        ["Kniend, Füße fixiert, Körper gerade.", "So langsam wie möglich nach vorn absenken.", "Mit den Händen abfangen, gleichmäßig atmen."],
    ],
    "kb_swing": [
        ["Kettlebellen framför fötterna, höften bakåt.", "Svinga mellan benen och explodera höften framåt.", "Armarna följer med, andas ut i toppen."],
        ["Kettlebell in front of your feet, hips back.", "Hike it between your legs and snap your hips forward.", "Arms just follow, exhale at the top."],
        ["Kettlebell delante de los pies, cadera atrás.", "Llévala entre las piernas y proyecta la cadera.", "Los brazos acompañan, espira arriba."],
        ["Kettlebell devant les pieds, hanches en arrière.", "Passe-la entre les jambes et projette les hanches.", "Les bras suivent, expire en haut."],
        ["Kettlebell vor den Füßen, Hüfte nach hinten.", "Zwischen die Beine schwingen, Hüfte explosiv strecken.", "Arme folgen nur, oben ausatmen."],
    ],
    "calf": [
        ["Stå på framfoten med hälarna fria.", "Res dig så högt du kan på tårna.", "Sänk hälarna långsamt under kanten."],
        ["Stand on the balls of your feet, heels free.", "Rise as high as you can onto your toes.", "Lower your heels slowly below the edge."],
        ["De puntillas con los talones libres.", "Sube lo más alto posible.", "Baja los talones despacio por debajo del borde."],
        ["Sur l'avant des pieds, talons dans le vide.", "Monte le plus haut possible sur la pointe.", "Redescends lentement sous le bord."],
        ["Auf dem Vorfuß stehen, Fersen frei.", "So hoch wie möglich auf die Zehen.", "Fersen langsam unter die Kante senken."],
    ],
    "hip_ab": [
        ["Sitt med ryggen mot dynan, dynorna utanpå knäna.", "Tryck isär knäna så långt du kan.", "Håll en sekund, för ihop långsamt."],
        ["Sit with your back on the pad, pads outside your knees.", "Push your knees apart as far as you can.", "Hold a second, bring them back slowly."],
        ["Sentado, almohadillas por fuera de las rodillas.", "Separa las rodillas al máximo.", "Aguanta un segundo, cierra despacio."],
        ["Assis, coussinets à l'extérieur des genoux.", "Écarte les genoux au maximum.", "Tiens une seconde, referme lentement."],
        ["Sitzen, Polster außen an den Knien.", "Knie so weit wie möglich auseinanderdrücken.", "Eine Sekunde halten, langsam schließen."],
    ],
    "hip_ad": [
        ["Sitt med ryggen mot dynan, dynorna innanför knäna.", "Kläm ihop benen mot mitten.", "Öppna långsamt, andas ut när du klämmer."],
        ["Sit with your back on the pad, pads inside your knees.", "Squeeze your legs together.", "Open slowly, exhale as you squeeze."],
        ["Sentado, almohadillas por dentro de las rodillas.", "Junta las piernas.", "Abre despacio, espira al cerrar."],
        ["Assis, coussinets à l'intérieur des genoux.", "Serre les jambes l'une contre l'autre.", "Rouvre lentement, expire en serrant."],
        ["Sitzen, Polster innen an den Knien.", "Beine zusammendrücken.", "Langsam öffnen, beim Zusammendrücken ausatmen."],
    ],
    "copenhagen": [
        ["Sidoplanka med övre benet på bänken.", "Lyft höften tills kroppen är rak.", "Håll och andas lugnt, byt sida."],
        ["Side plank with your top leg on the bench.", "Lift your hips until your body is straight.", "Hold and breathe calmly, switch sides."],
        ["Plancha lateral con la pierna de arriba en el banco.", "Eleva la cadera hasta alinear el cuerpo.", "Aguanta respirando, cambia de lado."],
        ["Gainage latéral, jambe du dessus sur le banc.", "Monte le bassin jusqu'à aligner le corps.", "Tiens en respirant, change de côté."],
        ["Seitstütz, oberes Bein auf der Bank.", "Hüfte heben, bis der Körper gerade ist.", "Halten und ruhig atmen, Seite wechseln."],
    ],
    "deadlift": [
        ["Stången över mitten av foten, grepp utanför knäna.", "Res dig genom att trycka golvet ifrån dig.", "Andas in och spänn innan lyftet, rak rygg hela vägen."],
        ["Bar over mid-foot, grip just outside your knees.", "Stand up by pushing the floor away.", "Breathe in and brace before the pull, flat back throughout."],
        ["Barra sobre el medio del pie, agarre fuera de las rodillas.", "Levántate empujando el suelo.", "Inspira y aprieta antes de tirar, espalda recta."],
        ["Barre au-dessus du milieu du pied, prise hors des genoux.", "Relève-toi en poussant le sol.", "Inspire et gaine avant de tirer, dos plat."],
        ["Stange über dem Mittelfuß, Griff außerhalb der Knie.", "Aufrichten, indem du den Boden wegdrückst.", "Vor dem Zug einatmen und anspannen, Rücken gerade."],
    ],
    "sumo": [
        ["Bred fotställning, greppet innanför knäna.", "Tryck knäna utåt och res dig med stången nära kroppen.", "Bröstet upp, andas ut i toppen."],
        ["Wide stance, grip inside your knees.", "Push your knees out and stand up with the bar close.", "Chest up, exhale at the top."],
        ["Apertura amplia, agarre por dentro de las rodillas.", "Abre las rodillas y sube con la barra pegada.", "Pecho arriba, espira arriba."],
        ["Pieds larges, prise entre les genoux.", "Pousse les genoux dehors et monte barre collée.", "Poitrine haute, expire en haut."],
        ["Breiter Stand, Griff innerhalb der Knie.", "Knie nach außen drücken, mit Stange nah am Körper aufrichten.", "Brust raus, oben ausatmen."],
    ],
    "row": [
        ["Fäll framåt med rak rygg, stången hänger under axlarna.", "Dra stången mot naveln med armbågarna bakåt.", "Sänk kontrollerat, andas ut när du drar."],
        ["Hinge forward with a flat back, bar hanging below your shoulders.", "Row the bar to your belly button, elbows back.", "Lower under control, exhale as you pull."],
        ["Inclínate con la espalda recta, barra bajo los hombros.", "Lleva la barra al ombligo, codos atrás.", "Baja con control, espira al tirar."],
        ["Penché, dos plat, barre sous les épaules.", "Tire la barre vers le nombril, coudes en arrière.", "Redescends avec contrôle, expire en tirant."],
        ["Mit geradem Rücken vorbeugen, Stange unter den Schultern.", "Stange zum Bauchnabel ziehen, Ellbogen nach hinten.", "Kontrolliert senken, beim Ziehen ausatmen."],
    ],
    "db_row": [
        ["Hand och knä på bänken, hanteln i andra handen.", "Dra hanteln mot höften med armbågen nära kroppen.", "Sänk långsamt, håll ryggen stilla."],
        ["Hand and knee on the bench, dumbbell in the other hand.", "Row the dumbbell to your hip, elbow close.", "Lower slowly, keep your back still."],
        ["Mano y rodilla en el banco, mancuerna en la otra mano.", "Lleva la mancuerna a la cadera, codo pegado.", "Baja despacio, espalda quieta."],
        ["Main et genou sur le banc, haltère dans l'autre main.", "Tire l'haltère vers la hanche, coude près du corps.", "Redescends lentement, dos immobile."],
        ["Hand und Knie auf der Bank, Hantel in der anderen Hand.", "Hantel zur Hüfte ziehen, Ellbogen nah am Körper.", "Langsam senken, Rücken ruhig halten."],
    ],
    "cable_row": [
        ["Sitt upprätt, fötterna mot stödet, armarna raka.", "Dra handtaget mot magen och för ihop skulderbladen.", "Släpp tillbaka långsamt, andas ut när du drar."],
        ["Sit tall, feet on the platform, arms straight.", "Pull the handle to your stomach, squeeze your shoulder blades.", "Return slowly, exhale as you pull."],
        ["Sentado erguido, pies apoyados, brazos estirados.", "Lleva el agarre al abdomen y junta escápulas.", "Vuelve despacio, espira al tirar."],
        ["Assis droit, pieds calés, bras tendus.", "Tire la poignée vers le ventre, serre les omoplates.", "Reviens lentement, expire en tirant."],
        ["Aufrecht sitzen, Füße an der Plattform, Arme gestreckt.", "Griff zum Bauch ziehen, Schulterblätter zusammen.", "Langsam zurück, beim Ziehen ausatmen."],
    ],
    "pull_up": [
        ["Häng i stången med raka armar.", "Dra dig upp tills hakan är över stången.", "Sänk dig hela vägen, andas ut uppåt."],
        ["Hang from the bar with straight arms.", "Pull up until your chin clears the bar.", "Lower all the way down, exhale on the way up."],
        ["Cuélgate de la barra con los brazos estirados.", "Sube hasta pasar la barbilla por encima.", "Baja del todo, espira al subir."],
        ["Suspendu à la barre, bras tendus.", "Tire-toi jusqu'à passer le menton.", "Redescends complètement, expire en montant."],
        ["Mit gestreckten Armen an der Stange hängen.", "Hochziehen, bis das Kinn über der Stange ist.", "Ganz ablassen, beim Hochziehen ausatmen."],
    ],
    "muscle_up": [
        ["Häng i stången med falskt grepp.", "Dra explosivt och vrid över stången till stöd.", "Pressa ut armarna, sänk kontrollerat."],
        ["Hang from the bar with a false grip.", "Pull explosively and turn over the bar into support.", "Press out to straight arms, lower under control."],
        ["Cuélgate con agarre falso.", "Tira explosivo y pasa por encima de la barra.", "Extiende los brazos, baja con control."],
        ["Suspendu en fausse prise.", "Tire de façon explosive et passe au-dessus de la barre.", "Tends les bras, redescends avec contrôle."],
        ["Mit falschem Griff an der Stange hängen.", "Explosiv ziehen und über die Stange in den Stütz drehen.", "Arme durchdrücken, kontrolliert ablassen."],
    ],
    "lat_pull": [
        ["Lårstöden över låren, brett grepp på stången.", "Dra stången till övre bröstet med armbågarna nedåt.", "Släpp upp långsamt, andas ut när du drar."],
        ["Thigh pads over your legs, wide grip on the bar.", "Pull the bar to your upper chest, elbows down.", "Let it up slowly, exhale as you pull."],
        ["Rodillos sobre los muslos, agarre ancho.", "Lleva la barra al pecho alto, codos abajo.", "Sube despacio, espira al tirar."],
        ["Cuisses calées, prise large.", "Tire la barre au haut de la poitrine, coudes vers le bas.", "Remonte lentement, expire en tirant."],
        ["Oberschenkel fixiert, breiter Griff.", "Stange zur oberen Brust ziehen, Ellbogen nach unten.", "Langsam zurück, beim Ziehen ausatmen."],
    ],
    "straight_arm": [
        ["Stå framför kabeln med lätt framåtlutning, raka armar.", "För stången i en båge ned mot låren.", "Armarna raka hela vägen, andas ut nere."],
        ["Stand facing the cable, slight lean, arms straight.", "Sweep the bar down in an arc to your thighs.", "Keep your arms straight, exhale at the bottom."],
        ["Frente a la polea, ligera inclinación, brazos rectos.", "Baja la barra en arco hasta los muslos.", "Brazos rectos, espira abajo."],
        ["Face à la poulie, buste incliné, bras tendus.", "Descends la barre en arc vers les cuisses.", "Bras tendus, expire en bas."],
        ["Vor dem Kabelzug, leicht vorgeneigt, Arme gestreckt.", "Stange im Bogen zu den Oberschenkeln führen.", "Arme gestreckt lassen, unten ausatmen."],
    ],
    "inv_row": [
        ["Häng under stången med rak kropp, hälarna i golvet.", "Dra bröstet upp mot stången.", "Rak kropp hela vägen, sänk långsamt."],
        ["Hang under the bar with a straight body, heels down.", "Pull your chest up to the bar.", "Body straight throughout, lower slowly."],
        ["Bajo la barra con el cuerpo recto, talones en el suelo.", "Lleva el pecho a la barra.", "Cuerpo recto, baja despacio."],
        ["Sous la barre, corps droit, talons au sol.", "Tire la poitrine vers la barre.", "Corps gainé, redescends lentement."],
        ["Unter der Stange hängen, Körper gerade, Fersen am Boden.", "Brust zur Stange ziehen.", "Körper gerade halten, langsam absenken."],
    ],
    "back_ext": [
        ["Höften mot dynan, fötterna fastlåsta.", "Fäll ned och res dig tills kroppen är rak.", "Inte översträcka, andas ut uppåt."],
        ["Hips on the pad, feet locked in.", "Lower down and rise until your body is straight.", "Don't overextend, exhale on the way up."],
        ["Cadera en el apoyo, pies sujetos.", "Baja y sube hasta alinear el cuerpo.", "Sin hiperextender, espira al subir."],
        ["Bassin sur le coussin, pieds bloqués.", "Descends puis remonte jusqu'à l'alignement.", "Sans cambrer, expire en montant."],
        ["Hüfte am Polster, Füße fixiert.", "Absenken und aufrichten, bis der Körper gerade ist.", "Nicht überstrecken, beim Hochkommen ausatmen."],
    ],
    "shrug": [
        ["Stå rakt med vikten i raka armar.", "Lyft axlarna rakt upp mot öronen.", "Håll en sekund, sänk långsamt."],
        ["Stand tall with the weight in straight arms.", "Lift your shoulders straight up toward your ears.", "Hold a second, lower slowly."],
        ["De pie con el peso en brazos rectos.", "Sube los hombros hacia las orejas.", "Aguanta un segundo, baja despacio."],
        ["Debout, charge bras tendus.", "Monte les épaules vers les oreilles.", "Tiens une seconde, redescends lentement."],
        ["Aufrecht, Gewicht in gestreckten Armen.", "Schultern gerade Richtung Ohren ziehen.", "Eine Sekunde halten, langsam senken."],
    ],
    # ---------------------------------------------------------- tryck ---
    "bench": [
        ["Ligg med ögonen under stången, fötterna i golvet.", "Sänk stången till nedre bröstet och pressa upp.", "Skulderbladen ihop, andas ut när du pressar."],
        ["Lie with your eyes under the bar, feet on the floor.", "Lower the bar to your lower chest and press up.", "Shoulder blades pinched, exhale as you press."],
        ["Tumbado con los ojos bajo la barra, pies en el suelo.", "Baja la barra al pecho bajo y empuja.", "Escápulas juntas, espira al empujar."],
        ["Allongé, yeux sous la barre, pieds au sol.", "Descends la barre au bas des pectoraux et pousse.", "Omoplates serrées, expire en poussant."],
        ["Liegen, Augen unter der Stange, Füße am Boden.", "Stange zur unteren Brust senken und hochdrücken.", "Schulterblätter zusammen, beim Drücken ausatmen."],
    ],
    "incline": [
        ["Ryggen mot den lutande bänken, vikterna vid bröstet.", "Pressa upp och lite inåt över övre bröstet.", "Sänk långsamt, andas ut när du pressar."],
        ["Back on the incline bench, weights at your chest.", "Press up and slightly in over your upper chest.", "Lower slowly, exhale as you press."],
        ["Espalda en el banco inclinado, pesos a la altura del pecho.", "Empuja arriba y algo hacia dentro.", "Baja despacio, espira al empujar."],
        ["Dos sur le banc incliné, charges à la poitrine.", "Pousse vers le haut et légèrement vers l'intérieur.", "Redescends lentement, expire en poussant."],
        ["Rücken auf der Schrägbank, Gewichte an der Brust.", "Nach oben und leicht nach innen drücken.", "Langsam senken, beim Drücken ausatmen."],
    ],
    "fly": [
        ["Armarna ovanför bröstet med lätt böjda armbågar.", "Öppna armarna i en båge tills du känner sträckning.", "För ihop som en kram, andas ut när du för ihop."],
        ["Arms above your chest, elbows slightly bent.", "Open your arms in an arc until you feel a stretch.", "Bring them together like a hug, exhale as you close."],
        ["Brazos sobre el pecho, codos algo flexionados.", "Abre en arco hasta notar estiramiento.", "Cierra como un abrazo, espira al cerrar."],
        ["Bras au-dessus de la poitrine, coudes légèrement fléchis.", "Ouvre en arc jusqu'à l'étirement.", "Referme comme une étreinte, expire en fermant."],
        ["Arme über der Brust, Ellbogen leicht gebeugt.", "Arme im Bogen öffnen, bis du Dehnung spürst.", "Wie eine Umarmung schließen, dabei ausatmen."],
    ],
    "chest_press": [
        ["Handtagen i bröstnivå, ryggen mot dynan.", "Pressa framåt tills armarna är nästan raka.", "Ta tillbaka långsamt, andas ut när du pressar."],
        ["Handles at chest height, back against the pad.", "Press forward until your arms are almost straight.", "Return slowly, exhale as you press."],
        ["Agarres a la altura del pecho, espalda apoyada.", "Empuja hasta casi estirar los brazos.", "Vuelve despacio, espira al empujar."],
        ["Poignées à hauteur de poitrine, dos calé.", "Pousse jusqu'à bras presque tendus.", "Reviens lentement, expire en poussant."],
        ["Griffe auf Brusthöhe, Rücken am Polster.", "Nach vorn drücken, bis die Arme fast gestreckt sind.", "Langsam zurück, beim Drücken ausatmen."],
    ],
    "push_up": [
        ["Händerna under axlarna, rak kropp från huvud till häl.", "Sänk bröstet mot golvet och tryck upp.", "Spänn mage och säte, andas ut uppåt."],
        ["Hands under your shoulders, straight from head to heels.", "Lower your chest to the floor and push up.", "Brace your core and glutes, exhale on the way up."],
        ["Manos bajo los hombros, cuerpo recto.", "Baja el pecho al suelo y empuja.", "Core y glúteos firmes, espira al subir."],
        ["Mains sous les épaules, corps droit.", "Descends la poitrine au sol et pousse.", "Gaine abdos et fessiers, expire en montant."],
        ["Hände unter den Schultern, Körper gerade.", "Brust zum Boden senken und hochdrücken.", "Bauch und Gesäß anspannen, hoch ausatmen."],
    ],
    "dip": [
        ["Stöd på räckena med raka armar.", "Sänk dig tills överarmarna är parallella med golvet.", "Tryck upp, andas ut uppåt."],
        ["Support yourself on the bars with straight arms.", "Lower until your upper arms are parallel to the floor.", "Push back up, exhale on the way up."],
        ["Apoyado en las paralelas con brazos rectos.", "Baja hasta que los brazos queden paralelos al suelo.", "Empuja arriba, espira al subir."],
        ["En appui sur les barres, bras tendus.", "Descends jusqu'aux bras parallèles au sol.", "Repousse, expire en montant."],
        ["Stütz am Barren mit gestreckten Armen.", "Absenken, bis die Oberarme parallel zum Boden sind.", "Hochdrücken, dabei ausatmen."],
    ],
    "bench_dip": [
        ["Händerna på bänken bakom dig, benen fram.", "Böj armbågarna och sänk höften.", "Tryck upp med triceps, axlarna nere."],
        ["Hands on the bench behind you, legs forward.", "Bend your elbows and lower your hips.", "Push up with your triceps, shoulders down."],
        ["Manos en el banco detrás, piernas delante.", "Flexiona los codos y baja la cadera.", "Empuja con tríceps, hombros abajo."],
        ["Mains sur le banc derrière toi, jambes devant.", "Plie les coudes et descends le bassin.", "Pousse avec les triceps, épaules basses."],
        ["Hände hinter dir auf der Bank, Beine vorn.", "Ellbogen beugen und Hüfte senken.", "Mit dem Trizeps hochdrücken, Schultern unten."],
    ],
    "ohp": [
        ["Stången framför axlarna, spänd mage och säte.", "Pressa stången rakt upp och för huvudet in under.", "Lås ut ovanför huvudet, andas ut uppe."],
        ["Bar in front of your shoulders, abs and glutes tight.", "Press the bar straight up and move your head through.", "Lock out overhead, exhale at the top."],
        ["Barra delante de los hombros, core y glúteos firmes.", "Empuja la barra recta y mete la cabeza.", "Bloquea arriba, espira."],
        ["Barre devant les épaules, abdos et fessiers serrés.", "Pousse la barre droit et passe la tête dessous.", "Verrouille au-dessus, expire."],
        ["Stange vor den Schultern, Bauch und Gesäß fest.", "Stange gerade hochdrücken, Kopf durchschieben.", "Oben durchstrecken, ausatmen."],
    ],
    "db_press": [
        ["Vikterna vid axlarna, ryggen rak.", "Pressa upp tills armarna är raka.", "Sänk kontrollerat till axelhöjd, andas ut uppåt."],
        ["Weights at your shoulders, back straight.", "Press up until your arms are straight.", "Lower under control to shoulder height, exhale on the way up."],
        ["Pesos a la altura de los hombros, espalda recta.", "Empuja hasta estirar los brazos.", "Baja con control, espira al subir."],
        ["Charges aux épaules, dos droit.", "Pousse jusqu'aux bras tendus.", "Redescends avec contrôle, expire en montant."],
        ["Gewichte an den Schultern, Rücken gerade.", "Hochdrücken, bis die Arme gestreckt sind.", "Kontrolliert auf Schulterhöhe senken, hoch ausatmen."],
    ],
    "push_press": [
        ["Stången framför axlarna, fötterna höftbrett.", "Gör en snabb dipp i knäna och driv stången uppåt.", "Lås ut ovanför huvudet, andas ut i toppen."],
        ["Bar in front of your shoulders, feet hip-width.", "Dip quickly at the knees and drive the bar up.", "Lock out overhead, exhale at the top."],
        ["Barra delante de los hombros, pies al ancho de cadera.", "Flexiona rápido y empuja la barra con las piernas.", "Bloquea arriba, espira."],
        ["Barre devant les épaules, pieds largeur de hanches.", "Petite flexion rapide et pousse avec les jambes.", "Verrouille au-dessus, expire."],
        ["Stange vor den Schultern, Füße hüftbreit.", "Kurz in die Knie und Stange mit den Beinen hochtreiben.", "Oben durchstrecken, ausatmen."],
    ],
    "landmine": [
        ["Stångänden vid axeln, lätt framåtlutning.", "Pressa stången framåt-uppåt tills armen är rak.", "Sänk kontrollerat, andas ut när du pressar."],
        ["Bar end at your shoulder, slight forward lean.", "Press the bar up and forward until your arm is straight.", "Lower under control, exhale as you press."],
        ["Extremo de la barra en el hombro, ligera inclinación.", "Empuja arriba y adelante hasta estirar el brazo.", "Baja con control, espira al empujar."],
        ["Extrémité de la barre à l'épaule, léger penché avant.", "Pousse vers l'avant et le haut, bras tendu.", "Redescends avec contrôle, expire en poussant."],
        ["Stangenende an der Schulter, leicht vorgeneigt.", "Nach vorn oben drücken, bis der Arm gestreckt ist.", "Kontrolliert senken, beim Drücken ausatmen."],
    ],
    "raise": [
        ["Stå med hantlarna längs sidorna, lätt böjda armbågar.", "Lyft armarna till axelhöjd.", "Sänk långsamt, inga ryck."],
        ["Stand with dumbbells at your sides, elbows soft.", "Raise your arms to shoulder height.", "Lower slowly, no swinging."],
        ["De pie con las mancuernas a los lados, codos suaves.", "Eleva los brazos a la altura de los hombros.", "Baja despacio, sin balanceo."],
        ["Debout, haltères le long du corps, coudes souples.", "Monte les bras à hauteur d'épaules.", "Redescends lentement, sans élan."],
        ["Hanteln seitlich, Ellbogen leicht gebeugt.", "Arme bis auf Schulterhöhe heben.", "Langsam senken, ohne Schwung."],
    ],
    "rear_delt": [
        ["Fäll framåt med rak rygg, hantlarna under bröstet.", "Lyft armarna ut åt sidorna och bakåt.", "Kläm skulderbladen, sänk långsamt."],
        ["Hinge forward with a flat back, dumbbells under your chest.", "Raise your arms out to the sides and back.", "Squeeze your shoulder blades, lower slowly."],
        ["Inclinado con la espalda recta, mancuernas bajo el pecho.", "Abre los brazos a los lados y atrás.", "Junta escápulas, baja despacio."],
        ["Penché, dos plat, haltères sous la poitrine.", "Écarte les bras sur les côtés et vers l'arrière.", "Serre les omoplates, redescends lentement."],
        ["Vorgebeugt, Rücken gerade, Hanteln unter der Brust.", "Arme seitlich nach hinten heben.", "Schulterblätter zusammen, langsam senken."],
    ],
    "face_pull": [
        ["Repet i ögonhöjd, armarna raka framåt.", "Dra repet mot ansiktet med armbågarna högt.", "Vrid ut händerna i slutet, släpp tillbaka långsamt."],
        ["Rope at eye level, arms straight ahead.", "Pull the rope to your face with elbows high.", "Rotate your hands out at the end, return slowly."],
        ["Cuerda a la altura de los ojos, brazos estirados.", "Tira hacia la cara con los codos altos.", "Rota las manos al final, vuelve despacio."],
        ["Corde à hauteur des yeux, bras tendus.", "Tire vers le visage, coudes hauts.", "Tourne les mains vers l'extérieur, reviens lentement."],
        ["Seil auf Augenhöhe, Arme gestreckt.", "Seil zum Gesicht ziehen, Ellbogen hoch.", "Am Ende Hände nach außen drehen, langsam zurück."],
    ],
    "upright_row": [
        ["Stå rakt med stången framför låren.", "Dra stången upp längs kroppen till bröstet.", "Armbågarna leder, sänk långsamt."],
        ["Stand tall with the bar in front of your thighs.", "Pull the bar up along your body to your chest.", "Elbows lead, lower slowly."],
        ["De pie con la barra delante de los muslos.", "Sube la barra pegada al cuerpo hasta el pecho.", "Los codos guían, baja despacio."],
        ["Debout, barre devant les cuisses.", "Monte la barre le long du corps jusqu'à la poitrine.", "Les coudes mènent, redescends lentement."],
        ["Aufrecht, Stange vor den Oberschenkeln.", "Stange am Körper entlang zur Brust ziehen.", "Ellbogen führen, langsam senken."],
    ],
    "hspu": [
        ["Handstående mot väggen, händerna axelbrett.", "Sänk huvudet mot golvet och pressa upp.", "Spänd kropp, andas ut uppåt."],
        ["Handstand against the wall, hands shoulder-width.", "Lower your head to the floor and press up.", "Tight body, exhale on the way up."],
        ["Pino contra la pared, manos al ancho de hombros.", "Baja la cabeza al suelo y empuja.", "Cuerpo firme, espira al subir."],
        ["Équilibre contre le mur, mains largeur d'épaules.", "Descends la tête au sol et pousse.", "Corps gainé, expire en montant."],
        ["Handstand an der Wand, Hände schulterbreit.", "Kopf zum Boden senken und hochdrücken.", "Körper fest, hoch ausatmen."],
    ],
    # ---------------------------------------------------------- armar ---
    "curl": [
        ["Stå rakt med armbågarna längs sidorna.", "Böj armarna och lyft vikten mot axlarna.", "Armbågarna stilla, sänk långsamt."],
        ["Stand tall with your elbows at your sides.", "Bend your arms and curl the weight to your shoulders.", "Elbows still, lower slowly."],
        ["De pie con los codos pegados.", "Flexiona y sube el peso hacia los hombros.", "Codos quietos, baja despacio."],
        ["Debout, coudes collés au corps.", "Fléchis et monte la charge vers les épaules.", "Coudes fixes, redescends lentement."],
        ["Aufrecht, Ellbogen am Körper.", "Arme beugen, Gewicht zu den Schultern heben.", "Ellbogen ruhig, langsam senken."],
    ],
    "wrist_curl": [
        ["Underarmarna på låren, handlederna utanför knäna.", "Rulla upp vikten med handlederna.", "Sänk långsamt, små kontrollerade rörelser."],
        ["Forearms on your thighs, wrists past your knees.", "Curl the weight up with your wrists.", "Lower slowly, small controlled reps."],
        ["Antebrazos en los muslos, muñecas fuera.", "Sube el peso flexionando las muñecas.", "Baja despacio, movimientos cortos."],
        ["Avant-bras sur les cuisses, poignets dépassant.", "Enroule la charge avec les poignets.", "Redescends lentement, mouvements courts."],
        ["Unterarme auf den Oberschenkeln, Handgelenke frei.", "Gewicht mit den Handgelenken einrollen.", "Langsam senken, kleine kontrollierte Bewegungen."],
    ],
    "pushdown": [
        ["Armbågarna mot sidorna, händerna i bröstnivå.", "Pressa ned tills armarna är raka.", "Armbågarna stilla, släpp upp långsamt."],
        ["Elbows at your sides, hands at chest height.", "Push down until your arms are straight.", "Elbows still, let it up slowly."],
        ["Codos pegados, manos a la altura del pecho.", "Empuja hacia abajo hasta estirar.", "Codos quietos, sube despacio."],
        ["Coudes collés, mains à hauteur de poitrine.", "Pousse vers le bas jusqu'à l'extension.", "Coudes fixes, remonte lentement."],
        ["Ellbogen am Körper, Hände auf Brusthöhe.", "Nach unten drücken, bis die Arme gestreckt sind.", "Ellbogen ruhig, langsam zurück."],
    ],
    "oh_ext": [
        ["Vikten ovanför huvudet med raka armar.", "Sänk vikten bakom huvudet genom att böja armbågarna.", "Armbågarna pekar framåt, sträck upp och andas ut."],
        ["Weight overhead with straight arms.", "Lower it behind your head by bending your elbows.", "Elbows point forward, extend and exhale."],
        ["Peso por encima de la cabeza, brazos rectos.", "Bájalo detrás de la cabeza flexionando los codos.", "Codos al frente, extiende y espira."],
        ["Charge au-dessus de la tête, bras tendus.", "Descends derrière la tête en pliant les coudes.", "Coudes vers l'avant, tends et expire."],
        ["Gewicht über dem Kopf, Arme gestreckt.", "Hinter den Kopf senken, Ellbogen beugen.", "Ellbogen zeigen nach vorn, strecken und ausatmen."],
    ],
    "skull": [
        ["Ligg på bänken med stången ovanför bröstet.", "Böj armbågarna och sänk stången mot pannan.", "Överarmarna stilla, sträck upp och andas ut."],
        ["Lie on the bench with the bar above your chest.", "Bend your elbows and lower the bar toward your forehead.", "Upper arms still, extend and exhale."],
        ["Tumbado con la barra sobre el pecho.", "Flexiona los codos y baja hacia la frente.", "Brazos quietos, extiende y espira."],
        ["Allongé, barre au-dessus de la poitrine.", "Plie les coudes et descends vers le front.", "Bras fixes, tends et expire."],
        ["Auf der Bank liegen, Stange über der Brust.", "Ellbogen beugen, Stange Richtung Stirn senken.", "Oberarme ruhig, strecken und ausatmen."],
    ],
    "kickback": [
        ["Fäll framåt, överarmen parallell med golvet.", "Sträck armen bakåt tills den är rak.", "Överarmen stilla, sänk långsamt."],
        ["Hinge forward, upper arm parallel to the floor.", "Extend your arm back until it is straight.", "Upper arm still, lower slowly."],
        ["Inclinado, brazo paralelo al suelo.", "Extiende el brazo hacia atrás.", "Brazo quieto, baja despacio."],
        ["Penché, bras parallèle au sol.", "Tends le bras vers l'arrière.", "Bras fixe, redescends lentement."],
        ["Vorgebeugt, Oberarm parallel zum Boden.", "Arm nach hinten strecken, bis er gerade ist.", "Oberarm ruhig, langsam zurück."],
    ],
    # ------------------------------------------------------------ bål ---
    "plank": [
        ["Underarmarna under axlarna, rak kropp.", "Spänn mage och säte och håll positionen.", "Andas lugnt, låt inte höften sjunka."],
        ["Forearms under your shoulders, body straight.", "Brace your abs and glutes and hold.", "Breathe calmly, don't let your hips sag."],
        ["Antebrazos bajo los hombros, cuerpo recto.", "Aprieta abdomen y glúteos y aguanta.", "Respira tranquilo, sin hundir la cadera."],
        ["Avant-bras sous les épaules, corps droit.", "Gaine abdos et fessiers et tiens.", "Respire calmement, ne laisse pas tomber le bassin."],
        ["Unterarme unter den Schultern, Körper gerade.", "Bauch und Gesäß anspannen und halten.", "Ruhig atmen, Hüfte nicht durchhängen lassen."],
    ],
    "side_plank": [
        ["Ligg på sidan med armbågen under axeln.", "Lyft höften tills kroppen är rak.", "Håll och andas lugnt, byt sida."],
        ["Lie on your side, elbow under your shoulder.", "Lift your hips until your body is straight.", "Hold and breathe calmly, switch sides."],
        ["De lado con el codo bajo el hombro.", "Eleva la cadera hasta alinear el cuerpo.", "Aguanta respirando, cambia de lado."],
        ["Sur le côté, coude sous l'épaule.", "Monte le bassin jusqu'à l'alignement.", "Tiens en respirant, change de côté."],
        ["Seitlich liegen, Ellbogen unter der Schulter.", "Hüfte heben, bis der Körper gerade ist.", "Halten, ruhig atmen, Seite wechseln."],
    ],
    "pallof": [
        ["Stå i sidled mot kabeln, handtaget vid bröstet.", "Pressa armarna rakt fram utan att vrida dig.", "Håll emot vridningen, andas ut när du pressar."],
        ["Stand side-on to the cable, handle at your chest.", "Press your arms straight out without rotating.", "Resist the twist, exhale as you press."],
        ["De lado a la polea, agarre en el pecho.", "Empuja los brazos al frente sin girar.", "Resiste el giro, espira al empujar."],
        ["De profil face à la poulie, poignée à la poitrine.", "Pousse les bras devant sans tourner.", "Résiste à la rotation, expire en poussant."],
        ["Seitlich zum Kabel, Griff an der Brust.", "Arme gerade nach vorn drücken, ohne zu drehen.", "Der Rotation widerstehen, beim Drücken ausatmen."],
    ],
    "dead_bug": [
        ["Ligg på rygg, armarna upp och knäna i 90 grader.", "Sträck motsatt arm och ben mot golvet.", "Ländryggen i golvet, andas ut när du sträcker."],
        ["Lie on your back, arms up, knees at 90 degrees.", "Extend the opposite arm and leg toward the floor.", "Lower back down, exhale as you extend."],
        ["Boca arriba, brazos arriba, rodillas a 90 grados.", "Extiende brazo y pierna contrarios.", "Lumbar pegada, espira al extender."],
        ["Sur le dos, bras levés, genoux à 90°.", "Tends bras et jambe opposés vers le sol.", "Bas du dos collé, expire en tendant."],
        ["Rückenlage, Arme oben, Knie 90 Grad.", "Gegenüberliegenden Arm und Bein zum Boden strecken.", "Unterer Rücken am Boden, beim Strecken ausatmen."],
    ],
    "bird_dog": [
        ["På alla fyra, händerna under axlarna.", "Sträck motsatt arm och ben tills de är raka.", "Rak rygg, håll en sekund och byt."],
        ["On all fours, hands under your shoulders.", "Extend the opposite arm and leg until straight.", "Flat back, hold a second and switch."],
        ["A cuatro patas, manos bajo los hombros.", "Extiende brazo y pierna contrarios.", "Espalda plana, aguanta y cambia."],
        ["À quatre pattes, mains sous les épaules.", "Tends bras et jambe opposés.", "Dos plat, tiens une seconde et change."],
        ["Vierfüßlerstand, Hände unter den Schultern.", "Gegenüberliegenden Arm und Bein strecken.", "Rücken gerade, kurz halten und wechseln."],
    ],
    "leg_raise": [
        ["Häng i stången med raka armar.", "Lyft benen framåt-uppåt utan att gunga.", "Sänk långsamt, andas ut när du lyfter."],
        ["Hang from the bar with straight arms.", "Raise your legs forward and up without swinging.", "Lower slowly, exhale as you lift."],
        ["Colgado con los brazos rectos.", "Eleva las piernas sin balancearte.", "Baja despacio, espira al subir."],
        ["Suspendu, bras tendus.", "Monte les jambes sans te balancer.", "Redescends lentement, expire en montant."],
        ["Mit gestreckten Armen hängen.", "Beine ohne Schwung nach vorn oben heben.", "Langsam senken, beim Heben ausatmen."],
    ],
    "ab_wheel": [
        ["På knä med hjulet under axlarna.", "Rulla framåt med rak kropp så långt du kontrollerar.", "Dra tillbaka med magen, andas ut."],
        ["Kneel with the wheel under your shoulders.", "Roll forward with a straight body as far as you can control.", "Pull back with your abs, exhale."],
        ["De rodillas con la rueda bajo los hombros.", "Rueda adelante con el cuerpo recto.", "Vuelve con el abdomen, espira."],
        ["À genoux, roue sous les épaules.", "Roule vers l'avant, corps droit.", "Reviens avec les abdos, expire."],
        ["Kniend, Rad unter den Schultern.", "Mit geradem Körper nach vorn rollen.", "Mit dem Bauch zurückziehen, ausatmen."],
    ],
    "crunch": [
        ["Ligg på rygg med böjda knän.", "Rulla upp överkroppen mot knäna.", "Andas ut när du rullar upp, sänk långsamt."],
        ["Lie on your back with bent knees.", "Curl your upper body toward your knees.", "Exhale as you curl up, lower slowly."],
        ["Boca arriba con las rodillas flexionadas.", "Enrolla el tronco hacia las rodillas.", "Espira al subir, baja despacio."],
        ["Sur le dos, genoux fléchis.", "Enroule le buste vers les genoux.", "Expire en montant, redescends lentement."],
        ["Rückenlage, Knie gebeugt.", "Oberkörper zu den Knien einrollen.", "Beim Hochrollen ausatmen, langsam senken."],
    ],
    "russian": [
        ["Sitt med fötterna lyfta och överkroppen bakåtlutad.", "Vrid överkroppen från sida till sida.", "Rak rygg, andas ut i varje vridning."],
        ["Sit with your feet up and torso leaning back.", "Rotate your torso from side to side.", "Straight back, exhale on each twist."],
        ["Sentado con los pies arriba, torso inclinado atrás.", "Gira el tronco de lado a lado.", "Espalda recta, espira en cada giro."],
        ["Assis, pieds levés, buste incliné.", "Tourne le buste d'un côté à l'autre.", "Dos droit, expire à chaque rotation."],
        ["Sitzen, Füße angehoben, Oberkörper zurückgelehnt.", "Oberkörper von Seite zu Seite drehen.", "Rücken gerade, bei jeder Drehung ausatmen."],
    ],
    "hollow": [
        ["Ligg på rygg, armarna bakom huvudet.", "Lyft axlar och ben från golvet och håll.", "Ländryggen i golvet, andas lugnt."],
        ["Lie on your back, arms overhead.", "Lift your shoulders and legs off the floor and hold.", "Lower back down, breathe calmly."],
        ["Boca arriba, brazos por encima de la cabeza.", "Eleva hombros y piernas y aguanta.", "Lumbar pegada, respira tranquilo."],
        ["Sur le dos, bras au-dessus de la tête.", "Décolle épaules et jambes et tiens.", "Bas du dos collé, respire calmement."],
        ["Rückenlage, Arme über dem Kopf.", "Schultern und Beine anheben und halten.", "Unterer Rücken am Boden, ruhig atmen."],
    ],
    "woodchop": [
        ["Stå i sidled mot kabeln, handtaget högt.", "Dra diagonalt ned över kroppen med raka armar.", "Rotera från höften, andas ut i rörelsen."],
        ["Stand side-on to the cable, handle high.", "Pull diagonally down across your body, arms straight.", "Rotate from your hips, exhale through the move."],
        ["De lado a la polea, agarre alto.", "Tira en diagonal hacia abajo con los brazos rectos.", "Gira desde la cadera, espira."],
        ["De profil, poignée en haut.", "Tire en diagonale vers le bas, bras tendus.", "Tourne depuis les hanches, expire."],
        ["Seitlich zum Kabel, Griff oben.", "Diagonal nach unten ziehen, Arme gestreckt.", "Aus der Hüfte drehen, dabei ausatmen."],
    ],
    "carry": [
        ["Vikten i ena handen, stå rakt.", "Gå med korta steg utan att luta dig.", "Spänd bål, andas jämnt."],
        ["Weight in one hand, stand tall.", "Walk with short steps without leaning.", "Brace your core, breathe steadily."],
        ["Peso en una mano, de pie y erguido.", "Camina con pasos cortos sin inclinarte.", "Core firme, respira constante."],
        ["Charge dans une main, debout et droit.", "Marche à petits pas sans pencher.", "Gainé, respire régulièrement."],
        ["Gewicht in einer Hand, aufrecht stehen.", "Mit kurzen Schritten gehen, ohne zu kippen.", "Rumpf fest, gleichmäßig atmen."],
    ],
    # ------------------------------------------------------- helkropp ---
    "clean": [
        ["Stången över mitten av foten, rak rygg.", "Dra explosivt och ta emot stången framför axlarna.", "Armbågarna snabbt fram, andas ut när du står."],
        ["Bar over mid-foot, flat back.", "Pull explosively and catch the bar in front of your shoulders.", "Elbows fast forward, exhale once you stand."],
        ["Barra sobre el medio del pie, espalda recta.", "Tira explosivo y recibe la barra en los hombros.", "Codos rápido al frente, espira al estar de pie."],
        ["Barre au-dessus du milieu du pied, dos plat.", "Tire de façon explosive et reçois la barre aux épaules.", "Coudes vite devant, expire une fois debout."],
        ["Stange über dem Mittelfuß, Rücken gerade.", "Explosiv ziehen, Stange vor den Schultern annehmen.", "Ellbogen schnell nach vorn, im Stand ausatmen."],
    ],
    "snatch": [
        ["Brett grepp, stången över mitten av foten.", "Dra explosivt och ta emot stången rakt ovanför huvudet.", "Låsta armar, stå stilla innan du sänker."],
        ["Wide grip, bar over mid-foot.", "Pull explosively and catch the bar straight overhead.", "Locked arms, stand still before you lower it."],
        ["Agarre ancho, barra sobre el medio del pie.", "Tira explosivo y recibe la barra arriba.", "Brazos bloqueados, quieto antes de bajar."],
        ["Prise large, barre au-dessus du milieu du pied.", "Tire et reçois la barre au-dessus de la tête.", "Bras verrouillés, stable avant de redescendre."],
        ["Breiter Griff, Stange über dem Mittelfuß.", "Explosiv ziehen, Stange über dem Kopf annehmen.", "Arme gesperrt, ruhig stehen vor dem Absenken."],
    ],
    "thruster": [
        ["Stången framför axlarna, frontböjsposition.", "Böj ned och driv upp till en press över huvudet i en rörelse.", "Använd benens kraft, andas ut i toppen."],
        ["Bar in front of your shoulders, front squat position.", "Squat down and drive up into an overhead press in one move.", "Use your legs' power, exhale at the top."],
        ["Barra delante de los hombros, posición de sentadilla frontal.", "Baja y sube con un press por encima de la cabeza.", "Usa la fuerza de piernas, espira arriba."],
        ["Barre devant les épaules, position de front squat.", "Descends puis enchaîne avec un développé.", "Utilise les jambes, expire en haut."],
        ["Stange vor den Schultern, Frontkniebeuge-Position.", "Hocke und in einem Zug über Kopf drücken.", "Kraft aus den Beinen, oben ausatmen."],
    ],
    "kb_clean_press": [
        ["Kettlebellen mellan fötterna, höften bakåt.", "Vänd upp den till axeln och pressa den över huvudet.", "Spänd bål, andas ut i pressen."],
        ["Kettlebell between your feet, hips back.", "Clean it to your shoulder and press it overhead.", "Brace your core, exhale on the press."],
        ["Kettlebell entre los pies, cadera atrás.", "Llévala al hombro y empuja por encima de la cabeza.", "Core firme, espira al empujar."],
        ["Kettlebell entre les pieds, hanches en arrière.", "Monte-la à l'épaule puis développe au-dessus.", "Gainé, expire en poussant."],
        ["Kettlebell zwischen den Füßen, Hüfte nach hinten.", "Zur Schulter umsetzen, dann über Kopf drücken.", "Rumpf fest, beim Drücken ausatmen."],
    ],
    "tgu": [
        ["Ligg på rygg med kettlebellen i rak arm uppåt.", "Res dig steg för steg till stående med armen kvar uppe.", "Blicken på vikten, gå ned samma väg långsamt."],
        ["Lie on your back with the kettlebell in a straight arm above you.", "Stand up step by step, keeping the arm locked overhead.", "Eyes on the weight, reverse the steps slowly."],
        ["Boca arriba con la kettlebell en el brazo estirado.", "Levántate paso a paso sin bajar el brazo.", "Mira el peso, vuelve igual despacio."],
        ["Sur le dos, kettlebell bras tendu vers le haut.", "Relève-toi étape par étape, bras verrouillé.", "Regard sur la charge, redescends lentement."],
        ["Rückenlage, Kettlebell im gestreckten Arm oben.", "Schritt für Schritt aufstehen, Arm bleibt oben.", "Blick aufs Gewicht, langsam zurück."],
    ],
    "burpee": [
        ["Stå rakt med fötterna höftbrett.", "Händerna i golvet, hoppa bak till planka och tillbaka.", "Res dig och hoppa upp, andas i takt."],
        ["Stand tall, feet hip-width.", "Hands to the floor, jump back to a plank and back in.", "Stand up and jump, breathe in rhythm."],
        ["De pie, pies al ancho de cadera.", "Manos al suelo, salta a plancha y vuelve.", "Levántate y salta, respira con ritmo."],
        ["Debout, pieds largeur de hanches.", "Mains au sol, saute en planche et reviens.", "Relève-toi et saute, respire en rythme."],
        ["Aufrecht, Füße hüftbreit.", "Hände zum Boden, in den Stütz springen und zurück.", "Aufstehen und springen, im Rhythmus atmen."],
    ],
    "box_jump": [
        ["Stå en halv meter från lådan.", "Gunga med armarna och hoppa upp, landa mjukt.", "Res dig helt uppe, kliv ned."],
        ["Stand half a metre from the box.", "Swing your arms and jump up, land softly.", "Stand fully at the top, step down."],
        ["A medio metro del cajón.", "Impúlsate con los brazos y salta, aterriza suave.", "Ponte de pie arriba y baja caminando."],
        ["À un demi-mètre de la box.", "Balance les bras et saute, réception souple.", "Redresse-toi en haut, redescends en marchant."],
        ["Einen halben Meter vor der Box stehen.", "Mit Armschwung hochspringen, weich landen.", "Oben ganz aufrichten, heruntersteigen."],
    ],
    "battle_ropes": [
        ["Halvböjda ben, ett rep i varje hand.", "Slå vågor med armarna växelvis i högt tempo.", "Spänd bål, andas rytmiskt."],
        ["Half-squat stance, one rope in each hand.", "Make waves with alternating arms at a high pace.", "Brace your core, breathe rhythmically."],
        ["Piernas semiflexionadas, una cuerda en cada mano.", "Haz ondas alternando brazos a ritmo alto.", "Core firme, respira con ritmo."],
        ["Jambes semi-fléchies, une corde par main.", "Fais des vagues en alternant les bras, vite.", "Gainé, respire en rythme."],
        ["Halbe Hocke, in jeder Hand ein Seil.", "Mit wechselnden Armen schnell Wellen schlagen.", "Rumpf fest, rhythmisch atmen."],
    ],
    "mountain": [
        ["Hög planka med händerna under axlarna.", "Dra knäna växelvis mot bröstet i högt tempo.", "Höften låg och stilla, andas i takt."],
        ["High plank, hands under your shoulders.", "Drive your knees to your chest alternately at a high pace.", "Hips low and steady, breathe in rhythm."],
        ["Plancha alta, manos bajo los hombros.", "Lleva las rodillas al pecho alternando rápido.", "Cadera baja y estable, respira con ritmo."],
        ["Planche haute, mains sous les épaules.", "Ramène les genoux vers la poitrine en alternance, vite.", "Bassin bas et stable, respire en rythme."],
        ["Hoher Stütz, Hände unter den Schultern.", "Knie abwechselnd schnell zur Brust ziehen.", "Hüfte tief und ruhig, im Rhythmus atmen."],
    ],
    # ------------------------------------------------------- kondition ---
    "run": [
        ["Upprätt hållning, lätt framåtlutning från fotlederna.", "Korta, snabba steg med landning under kroppen.", "Avslappnade axlar, andas rytmiskt."],
        ["Tall posture, slight lean from the ankles.", "Short, quick steps landing under your body.", "Relaxed shoulders, breathe rhythmically."],
        ["Postura erguida, ligera inclinación desde los tobillos.", "Pasos cortos y rápidos bajo el cuerpo.", "Hombros relajados, respira con ritmo."],
        ["Posture droite, légère inclinaison depuis les chevilles.", "Petits pas rapides, appui sous le corps.", "Épaules relâchées, respire en rythme."],
        ["Aufrechte Haltung, leichte Vorlage aus den Knöcheln.", "Kurze, schnelle Schritte, Landung unter dem Körper.", "Lockere Schultern, rhythmisch atmen."],
    ],
    "intervals": [
        ["Värm upp 10 minuter lugnt.", "Spring varje intervall i jämnt, hårt tempo.", "Jogga eller gå i vilan, andas ned pulsen."],
        ["Warm up for 10 easy minutes.", "Run each rep at an even, hard pace.", "Jog or walk the recovery, bring your breathing down."],
        ["Calienta 10 minutos suave.", "Corre cada serie a ritmo fuerte y constante.", "Trota o camina en la recuperación."],
        ["Échauffe-toi 10 minutes en douceur.", "Cours chaque fraction à allure soutenue et régulière.", "Trottine ou marche pendant la récup."],
        ["10 Minuten locker einlaufen.", "Jedes Intervall gleichmäßig hart laufen.", "In der Pause traben oder gehen, Atmung beruhigen."],
    ],
    "tempo": [
        ["Värm upp lugnt innan tempodelen.", "Håll ett jämnt, ansträngande men kontrollerat tempo.", "Du ska kunna säga några ord – inte prata."],
        ["Warm up easily before the tempo block.", "Hold an even, comfortably hard pace.", "You can say a few words – not chat."],
        ["Calienta suave antes del bloque.", "Mantén un ritmo exigente pero controlado.", "Puedes decir unas palabras, no conversar."],
        ["Échauffe-toi avant le bloc tempo.", "Tiens une allure soutenue mais contrôlée.", "Tu peux dire quelques mots, pas discuter."],
        ["Vor dem Tempoteil locker einlaufen.", "Gleichmäßig zügiges, kontrolliertes Tempo halten.", "Ein paar Worte gehen – kein Plaudern."],
    ],
    "long_run": [
        ["Börja lugnare än det känns.", "Håll zon 2 hela passet – lugnt och jämnt.", "Du ska kunna prata i hela meningar."],
        ["Start slower than it feels you should.", "Stay in Zone 2 the whole run – easy and even.", "You should be able to talk in full sentences."],
        ["Empieza más lento de lo que te pide el cuerpo.", "Quédate en Zona 2 todo el rodaje.", "Debes poder hablar con frases completas."],
        ["Pars plus lentement que tes sensations.", "Reste en endurance fondamentale toute la sortie.", "Tu dois pouvoir parler en phrases complètes."],
        ["Langsamer starten, als es sich anfühlt.", "Den ganzen Lauf in der Grundlagenausdauer bleiben.", "Du solltest in ganzen Sätzen reden können."],
    ],
    "hill": [
        ["Hitta en backe på 100–200 m.", "Spring uppför med kraftfulla armar och korta steg.", "Gå eller jogga ned, andas ut pulsen."],
        ["Find a hill of 100–200 m.", "Run up with strong arms and short steps.", "Walk or jog back down to recover."],
        ["Busca una cuesta de 100–200 m.", "Sube con brazos activos y pasos cortos.", "Baja andando o trotando para recuperar."],
        ["Trouve une côte de 100–200 m.", "Monte avec des bras actifs et des pas courts.", "Redescends en marchant ou trottinant."],
        ["Einen Hügel mit 100–200 m suchen.", "Mit kräftigem Armeinsatz und kurzen Schritten hoch.", "Gehend oder trabend zurück, erholen."],
    ],
    "walk": [
        ["Upprätt hållning, blicken framåt.", "Gå i raskt tempo med aktiva armar.", "Andas jämnt – du ska kunna prata."],
        ["Tall posture, eyes forward.", "Walk at a brisk pace with active arms.", "Breathe evenly – you should be able to talk."],
        ["Postura erguida, mirada al frente.", "Camina a paso vivo con brazos activos.", "Respira regular, debes poder hablar."],
        ["Posture droite, regard devant.", "Marche d'un bon pas, bras actifs.", "Respire régulièrement, tu dois pouvoir parler."],
        ["Aufrechte Haltung, Blick nach vorn.", "Zügig gehen, Arme aktiv.", "Gleichmäßig atmen – Reden muss möglich sein."],
    ],
    "bike": [
        ["Sadeln i höfthöjd, lätt böjt knä i bottenläget.", "Trampa runt med jämnt tryck genom hela varvet.", "Stilla överkropp, andas rytmiskt."],
        ["Saddle at hip height, slight knee bend at the bottom.", "Pedal with even pressure through the whole stroke.", "Quiet upper body, breathe rhythmically."],
        ["Sillín a la altura de la cadera, rodilla algo flexionada abajo.", "Pedalea con presión constante todo el giro.", "Tronco quieto, respira con ritmo."],
        ["Selle à hauteur de hanche, genou légèrement fléchi en bas.", "Pédale avec une pression régulière sur tout le tour.", "Haut du corps calme, respire en rythme."],
        ["Sattel auf Hüfthöhe, Knie unten leicht gebeugt.", "Gleichmäßig über die ganze Kurbelumdrehung treten.", "Ruhiger Oberkörper, rhythmisch atmen."],
    ],
    "elliptical": [
        ["Hela foten på pedalerna, händerna på handtagen.", "Driv rörelsen med benen och följ med armarna.", "Upprätt hållning, andas jämnt."],
        ["Whole foot on the pedals, hands on the handles.", "Drive with your legs and let your arms follow.", "Upright posture, breathe evenly."],
        ["Todo el pie en los pedales, manos en los agarres.", "Impulsa con las piernas y acompaña con los brazos.", "Postura erguida, respira regular."],
        ["Pieds à plat sur les pédales, mains sur les poignées.", "Pousse avec les jambes, les bras suivent.", "Posture droite, respire régulièrement."],
        ["Ganzer Fuß auf den Pedalen, Hände an den Griffen.", "Mit den Beinen antreiben, Arme folgen.", "Aufrechte Haltung, gleichmäßig atmen."],
    ],
    "stairs": [
        ["Hela foten på steget, lätt framåtlutning.", "Kliv upp i jämn takt och tryck genom hälen.", "Håll i lätt, andas rytmiskt."],
        ["Whole foot on the step, slight forward lean.", "Step up at an even rhythm, push through the heel.", "Hold on lightly, breathe rhythmically."],
        ["Todo el pie en el escalón, ligera inclinación.", "Sube a ritmo constante empujando con el talón.", "Agárrate suave, respira con ritmo."],
        ["Pied entier sur la marche, léger penché.", "Monte à rythme régulier en poussant dans le talon.", "Tiens-toi légèrement, respire en rythme."],
        ["Ganzer Fuß auf der Stufe, leicht vorgeneigt.", "Gleichmäßig steigen, über die Ferse drücken.", "Nur leicht festhalten, rhythmisch atmen."],
    ],
    "jump_rope": [
        ["Repet bakom hälarna, armbågarna nära kroppen.", "Snurra med handlederna och hoppa lågt på framfoten.", "Mjuka landningar, andas i takt."],
        ["Rope behind your heels, elbows close to your body.", "Turn with your wrists and hop low on the balls of your feet.", "Soft landings, breathe in rhythm."],
        ["Cuerda detrás de los talones, codos pegados.", "Gira con las muñecas y salta bajo de puntillas.", "Aterrizajes suaves, respira con ritmo."],
        ["Corde derrière les talons, coudes près du corps.", "Tourne avec les poignets, petits sauts sur l'avant du pied.", "Réceptions souples, respire en rythme."],
        ["Seil hinter den Fersen, Ellbogen nah am Körper.", "Aus den Handgelenken drehen, flach auf dem Vorfuß springen.", "Weich landen, im Rhythmus atmen."],
    ],
    "swim": [
        ["Platt kroppsläge med blicken nedåt.", "Långa armtag och lugn, jämn bensparksrytm.", "Andas ut i vattnet, in vid sidan."],
        ["Flat body position, eyes down.", "Long arm strokes and a calm, even kick.", "Exhale into the water, inhale to the side."],
        ["Cuerpo plano, mirada abajo.", "Brazadas largas y patada tranquila y constante.", "Espira en el agua, inspira de lado."],
        ["Corps à plat, regard vers le fond.", "Longues tractions et battements calmes et réguliers.", "Expire dans l'eau, inspire sur le côté."],
        ["Flache Wasserlage, Blick nach unten.", "Lange Armzüge, ruhiger gleichmäßiger Beinschlag.", "Ins Wasser ausatmen, seitlich einatmen."],
    ],
    # ---------------------------------------------------------- Hyrox ---
    "hyrox_run": [
        ["Börja varje kilometer kontrollerat efter stationen.", "Hitta ditt racetempo med korta, effektiva steg.", "Andas ned pulsen de första 200 metrarna."],
        ["Start each kilometre controlled after the station.", "Settle into race pace with short, efficient steps.", "Bring your breathing down in the first 200 metres."],
        ["Empieza cada kilómetro con control tras la estación.", "Busca tu ritmo de carrera con pasos cortos.", "Recupera la respiración los primeros 200 metros."],
        ["Pars contrôlé à chaque kilomètre après l'atelier.", "Trouve ton allure course, pas courts et efficaces.", "Fais redescendre le souffle sur les 200 premiers mètres."],
        ["Jeden Kilometer nach der Station kontrolliert starten.", "Mit kurzen, effizienten Schritten ins Renntempo finden.", "Atmung auf den ersten 200 Metern beruhigen."],
    ],
    "skierg": [
        ["Stå höftbrett med handtagen ovanför huvudet.", "Dra ned med raka armar och fäll höften bakåt.", "Res dig mellan dragen, andas ut i varje drag."],
        ["Stand hip-width with the handles overhead.", "Pull down with straight arms while hinging your hips back.", "Stand up between pulls, exhale on every pull."],
        ["Pies al ancho de cadera, agarres arriba.", "Tira hacia abajo con los brazos rectos llevando la cadera atrás.", "Sube entre tirones, espira en cada tirón."],
        ["Pieds largeur de hanches, poignées en haut.", "Tire vers le bas bras tendus en reculant les hanches.", "Redresse-toi entre les tirages, expire à chaque tirage."],
        ["Hüftbreit stehen, Griffe über dem Kopf.", "Mit gestreckten Armen ziehen, Hüfte nach hinten.", "Zwischen den Zügen aufrichten, bei jedem Zug ausatmen."],
    ],
    "sledpush": [
        ["Händerna på stolparna, kroppen lutad framåt.", "Driv med korta, kraftfulla steg och raka armar.", "Låg position hela vägen, andas i takt med stegen."],
        ["Hands on the poles, body leaning forward.", "Drive with short, powerful steps and straight arms.", "Stay low the whole way, breathe with your steps."],
        ["Manos en los postes, cuerpo inclinado.", "Empuja con pasos cortos y potentes, brazos rectos.", "Posición baja todo el rato, respira con los pasos."],
        ["Mains sur les montants, corps penché.", "Pousse à petits pas puissants, bras tendus.", "Reste bas, respire au rythme des pas."],
        ["Hände an den Stangen, Körper nach vorn geneigt.", "Mit kurzen, kräftigen Schritten und gestreckten Armen schieben.", "Tief bleiben, im Takt der Schritte atmen."],
    ],
    "sledpull": [
        ["Stå i rutan med repet framför dig, luta bakåt.", "Dra repet hand över hand mot dig.", "Kliv bakåt mellan dragen, andas jämnt."],
        ["Stand in the box with the rope in front, lean back.", "Pull the rope hand over hand toward you.", "Step back between pulls, breathe steadily."],
        ["En la zona con la cuerda delante, inclínate atrás.", "Tira de la cuerda mano sobre mano.", "Retrocede entre tirones, respira constante."],
        ["Dans la zone, corde devant toi, penche-toi en arrière.", "Tire la corde main après main.", "Recule entre les tirages, respire régulièrement."],
        ["Im Feld, Seil vor dir, nach hinten lehnen.", "Seil Hand über Hand zu dir ziehen.", "Zwischen den Zügen zurücktreten, gleichmäßig atmen."],
    ],
    "bbj": [
        ["Börja med en burpee, bröstet i golvet.", "Hoppa framåt med båda fötterna och landa mjukt.", "Kliv upp i stället för att hoppa – spara benen."],
        ["Start with a burpee, chest to the floor.", "Jump forward with both feet and land softly.", "Step up instead of jumping in – save your legs."],
        ["Empieza con un burpee, pecho al suelo.", "Salta adelante con los dos pies, aterriza suave.", "Levántate caminando, ahorra piernas."],
        ["Commence par un burpee, poitrine au sol.", "Saute en avant pieds joints, réception souple.", "Remonte en marchant pour économiser les jambes."],
        ["Mit einem Burpee beginnen, Brust zum Boden.", "Beidbeinig nach vorn springen, weich landen.", "Aufsteigen statt springen – Beine schonen."],
    ],
    "row_erg": [
        ["Sitt med böjda ben, armarna raka framåt.", "Tryck med benen, luta bakåt och dra handtaget mot magen.", "Armar–rygg–ben tillbaka, andas ut i draget."],
        ["Sit with bent legs, arms straight ahead.", "Push with your legs, lean back and pull the handle to your stomach.", "Arms–body–legs on the return, exhale on the drive."],
        ["Sentado con piernas flexionadas, brazos al frente.", "Empuja con las piernas, inclínate y lleva el agarre al abdomen.", "Brazos–tronco–piernas al volver, espira al tirar."],
        ["Assis jambes fléchies, bras tendus.", "Pousse avec les jambes, bascule et tire vers le ventre.", "Bras–buste–jambes au retour, expire en tirant."],
        ["Sitzen, Beine gebeugt, Arme gestreckt.", "Mit den Beinen drücken, zurücklehnen, Griff zum Bauch.", "Arme–Rumpf–Beine zurück, beim Zug ausatmen."],
    ],
    "farmers": [
        ["En vikt i varje hand, stå rakt.", "Gå med korta, snabba steg.", "Bryt inte greppet, andas jämnt."],
        ["A weight in each hand, stand tall.", "Walk with short, quick steps.", "Don't break your grip, breathe steadily."],
        ["Un peso en cada mano, erguido.", "Camina con pasos cortos y rápidos.", "No sueltes el agarre, respira constante."],
        ["Une charge dans chaque main, debout et droit.", "Marche à petits pas rapides.", "Ne lâche pas le grip, respire régulièrement."],
        ["In jeder Hand ein Gewicht, aufrecht stehen.", "Mit kurzen, schnellen Schritten gehen.", "Griff nicht lösen, gleichmäßig atmen."],
    ],
    "sandbag": [
        ["Sandsäcken på axlarna, stå rakt.", "Ta långa utfallssteg och låt bakre knät nudda golvet.", "Upprätt överkropp, andas ut när du trycker ifrån."],
        ["Sandbag on your shoulders, stand tall.", "Take long lunges and let the back knee touch the floor.", "Upright torso, exhale as you push off."],
        ["Saco sobre los hombros, erguido.", "Zancadas largas tocando el suelo con la rodilla.", "Torso erguido, espira al empujar."],
        ["Sac sur les épaules, debout et droit.", "Grandes fentes, le genou arrière touche le sol.", "Buste droit, expire en repoussant."],
        ["Sandsack auf den Schultern, aufrecht.", "Lange Ausfallschritte, hinteres Knie berührt den Boden.", "Oberkörper aufrecht, beim Abdrücken ausatmen."],
    ],
    "wallball": [
        ["Bollen mot bröstet, en armslängd från väggen.", "Böj djupt och kasta bollen mot målet med benens kraft.", "Ta emot i en böj, andas ut i varje kast."],
        ["Ball at your chest, an arm's length from the wall.", "Squat deep and throw the ball at the target using your legs.", "Catch into the squat, exhale on each throw."],
        ["Balón en el pecho, a un brazo de la pared.", "Sentadilla profunda y lanza a la diana con las piernas.", "Recibe bajando, espira en cada lanzamiento."],
        ["Ballon contre la poitrine, à un bras du mur.", "Squat profond et lance vers la cible avec les jambes.", "Réceptionne en descendant, expire à chaque lancer."],
        ["Ball vor der Brust, eine Armlänge von der Wand.", "Tief beugen, Ball mit Beinkraft ans Ziel werfen.", "In die Hocke fangen, bei jedem Wurf ausatmen."],
    ],
}


def ts_string(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def block(lang_index: int) -> str:
    lines = ["  guide: {"]
    for key, vals in UI.items():
        lines.append(f"    {key}: {ts_string(vals[lang_index])},")
    lines.append("    steps: {")
    for key, langs in S.items():
        start, move, control = langs[lang_index]
        lines.append(f"      {key}: {{ start: {ts_string(start)}, move: {ts_string(move)}, control: {ts_string(control)} }},")
    lines.append("    },")
    lines.append("  },")
    return "\n".join(lines) + "\n"


def main() -> None:
    for i, lang in enumerate(LANGS):
        for key, langs in S.items():
            assert len(langs) == 5 and all(len(x) == 3 and all(s.strip() for s in x) for x in langs), (key, lang)
        p = Path(f"src/lib/i18n/dictionaries/{lang}.ts")
        s = p.read_text()
        s = re.sub(r"  guide: \{\n.*?\n  \},\n", "", s, flags=re.S)
        anchor = "  logger: {"
        assert anchor in s
        s = s.replace(anchor, block(i) + anchor, 1)
        p.write_text(s)
    print(len(S), "rörelsemönster ×", len(LANGS), "språk")


if __name__ == "__main__":
    main()
