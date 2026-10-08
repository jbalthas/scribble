export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

const list = (s: string) => s.split(',').map((w) => w.trim()).filter(Boolean);

export const WORDS: Record<Difficulty, string[]> = {
  easy: list(`
apple, banana, pizza, hot dog, ice cream, cupcake, donut, cheese, egg, carrot, watermelon, cherry, lemon, grapes, cookie,
cat, dog, snake, turtle, frog, rabbit, pig, duck, bee, snail, spider, fish bowl, sun, moon, star, cloud, rain, rainbow,
tree, flower, cactus, mushroom, leaf, house, car, bus, boat, rocket, chair, table, bed, door, window, clock, key, hat, shoe,
sock, book, pencil, heart, balloon, ghost, kite, crown, umbrella, glasses, candle, light bulb, snowman, mountain, fire, flag,
gift, dice, sword, anchor, envelope, ladder, lamp, shirt, dress, bridge, tent, diamond, pumpkin, snowflake, spider web
`),
  medium: list(`
hamburger, sandwich, taco, sushi, popcorn, pancake, broccoli, pineapple, strawberry, birthday cake, spaghetti, french fries,
elephant, giraffe, lion, tiger, monkey, penguin, shark, whale, octopus, horse, cow, chicken, owl, eagle, butterfly, crab,
dolphin, kangaroo, zebra, camel, bat, unicorn, dragon, dinosaur, robot, alien, pirate, king, princess, clown, cowboy,
castle, lighthouse, igloo, windmill, pyramid, church, barn, bicycle, motorcycle, train, airplane, helicopter, submarine,
tractor, skateboard, scooter, lightning, beach, palm tree, rose, sunflower, river, television, computer, phone, camera,
guitar, piano, drum, trumpet, violin, microphone, headphones, backpack, wallet, lock, scissors, battery, magnet, hammer,
saw, toothbrush, toilet, bathtub, mirror, broom, basketball, football, soccer, baseball, trophy, money, treasure, map,
shield, bow and arrow, cannon, bomb, yo-yo, teddy bear, puzzle, chess, fireworks, christmas tree, skeleton, witch,
swimming pool, sandcastle, bird nest, beehive, dog house, cheeseburger, toaster, fan, mailbox, stop sign, globe, alarm clock,
volcano, island, waterfall, forest
`),
  hard: list(`
mermaid, vampire, zombie, wizard, ninja, astronaut, superhero, doctor, firefighter, police officer, chef, farmer, scientist,
teacher, skyscraper, school, hospital, airport, hot air balloon, tornado, desert, cave, compass, tennis, bowling, golf,
swimming, skiing, surfing, fishing, boxing, karate, haunted house, sleeping, dancing, running, jumping, crying, laughing,
sneezing, yawning, roller coaster, ferris wheel, camping, picnic, wedding, graduation, birthday, selfie, traffic jam,
black hole, time machine, earthquake, microwave, refrigerator, washing machine, vacuum, traffic light, parachute, telescope,
microscope, calendar, hourglass
`),
};
