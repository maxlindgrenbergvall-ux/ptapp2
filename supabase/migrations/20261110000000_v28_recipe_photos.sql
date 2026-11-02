-- ============================================================================
-- v28: riktiga matfoton i receptbiblioteket (Pexels, fri licens även för
-- kommersiellt bruk). Varje foto är granskat för att visa just den rätten;
-- rätter utan ett tillräckligt likt foto får ingen bild (appen visar då en
-- neutral reservbild). Foton som laddats upp till Storage skrivs inte över.
--
-- Genererad av scripts/gen-recipe-library.mjs. Körs efter v27. Kan köras om.
-- ============================================================================

update library_recipes set image_url = 'https://images.pexels.com/photos/1860208/pexels-photo-1860208.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'kycklingbowl-jasminris-broccoli' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/128408/pexels-photo-128408.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'proteinpasta-bolognese' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/3655916/pexels-photo-3655916.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'ugnslax-sotpotatis-sparris' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'kalkonwraps-hummus' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'proteinpannkakor-kvarg' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/434258/pexels-photo-434258.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'tonfisksallad-kikartor' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/3186654/pexels-photo-3186654.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'biff-quinoa-haricots' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/2474661/pexels-photo-2474661.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'kyckling-tikka-masala-latt' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/286283/pexels-photo-286283.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'tofuwok-edamame' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/1437268/pexels-photo-1437268.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'aggviteomelett-spenat-feta' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/2689419/pexels-photo-2689419.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'kycklingspett-tzatziki-pita' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/3872373/pexels-photo-3872373.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'halloumi-quinoasallad' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/1516415/pexels-photo-1516415.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'torsk-blomkal-tomat' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/6107787/pexels-photo-6107787.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'krispig-kycklingsallad' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/209540/pexels-photo-209540.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'rod-linssoppa' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/2092906/pexels-photo-2092906.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'rakor-zucchinispaghetti' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/568370/pexels-photo-568370.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'gronsaksfrittata' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/2116094/pexels-photo-2116094.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'blomkalsris-kyckling' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/1092730/pexels-photo-1092730.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'skyrbowl-bar-chia' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/2338407/pexels-photo-2338407.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'ugnskyckling-haricots-potatis' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/1211887/pexels-photo-1211887.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'grekisk-kycklingsallad' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/1640768/pexels-photo-1640768.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'overnight-oats-banan' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'pasta-tomatsas-kyckling' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/2741444/pexels-photo-2741444.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'bar-och-havresmoothie' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/916925/pexels-photo-916925.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'fullkornsmacka-banan' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/76093/pexels-photo-76093.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'sotsur-kyckling-ananas' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/1410235/pexels-photo-1410235.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'couscoussallad-kikartor' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/1065030/pexels-photo-1065030.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'kvargparfait-granola-hallon' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'kyckling-sotpotatisbowl' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/2741448/pexels-photo-2741448.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'laxpoke-ris-edamame' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/103124/pexels-photo-103124.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'agg-potatishash' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/2347311/pexels-photo-2347311.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'nudelwok-biff-broccoli' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/2087748/pexels-photo-2087748.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'burrito-bowl-svarta-bonor' and (image_url is null or image_url like 'https://images.pexels.com/%');
update library_recipes set image_url = 'https://images.pexels.com/photos/1307658/pexels-photo-1307658.jpeg?auto=compress&cs=tinysrgb&w=1200', updated_at = now()
  where slug = 'flaskfile-couscous-gronsaker' and (image_url is null or image_url like 'https://images.pexels.com/%');
