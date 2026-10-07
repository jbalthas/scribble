export const DEFAULT_WORDS = `
apple, banana, pizza, hamburger, hot dog, ice cream, cupcake, donut, sandwich, taco, sushi, popcorn, pancake, cheese, egg,
carrot, broccoli, watermelon, pineapple, strawberry, cherry, lemon, grapes, cookie, birthday cake, spaghetti, french fries,
cat, dog, elephant, giraffe, lion, tiger, monkey, penguin, shark, whale, octopus, snake, turtle, frog, rabbit, horse, cow,
pig, chicken, duck, owl, eagle, butterfly, spider, bee, snail, crab, dolphin, kangaroo, zebra, camel, bat, unicorn, dragon,
dinosaur, mermaid, ghost, vampire, zombie, robot, alien, wizard, pirate, ninja, astronaut, superhero, king, princess, clown,
doctor, firefighter, police officer, chef, farmer, cowboy, scientist, teacher,
house, castle, lighthouse, bridge, tent, igloo, skyscraper, windmill, pyramid, church, barn, school, hospital, airport,
car, bus, bicycle, motorcycle, train, airplane, helicopter, rocket, boat, submarine, tractor, skateboard, scooter, hot air balloon,
sun, moon, star, cloud, rain, snowman, rainbow, lightning, tornado, volcano, mountain, island, beach, waterfall, desert, cave,
tree, flower, cactus, mushroom, leaf, palm tree, rose, sunflower, forest, river,
chair, table, bed, lamp, door, window, clock, television, computer, phone, camera, guitar, piano, drum, trumpet, violin,
microphone, headphones, umbrella, glasses, hat, crown, shoe, sock, shirt, dress, backpack, wallet, key, lock, scissors,
pencil, book, envelope, candle, light bulb, battery, magnet, ladder, hammer, saw, toothbrush, toilet, bathtub, mirror, broom,
basketball, football, soccer, baseball, tennis, bowling, golf, swimming, skiing, surfing, fishing, boxing, karate, trophy,
heart, diamond, money, treasure, map, compass, anchor, sword, shield, bow and arrow, cannon, bomb, flag, balloon, gift,
kite, yo-yo, teddy bear, puzzle, dice, chess, fireworks, snowflake, christmas tree, pumpkin, skeleton, witch, haunted house,
sleeping, dancing, running, jumping, crying, laughing, sneezing, yawning, swimming pool, roller coaster, ferris wheel,
camping, picnic, wedding, graduation, birthday, selfie, traffic jam, black hole, time machine, sandcastle, fire, earthquake,
spider web, bird nest, beehive, fish bowl, dog house, cheeseburger, toaster, microwave, refrigerator, washing machine,
vacuum, fan, mailbox, traffic light, stop sign, parachute, telescope, microscope, globe, calendar, alarm clock, hourglass
`
  .split(',')
  .map((w) => w.trim())
  .filter(Boolean);
