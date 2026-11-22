// One author-written line per verb, first in Bulgarian and then in English.
const verbs = ['look', 'take', 'use', 'talk'];
const remarks = {
  "hotspot.apartment.adult_photo": [
    "На снимката съм излязъл отговорен. Явно фотографът е побързал.",
    "Ще я прибера. Двама като мен в една стая е вече събрание.",
    "Тая усмивка е само за пред хора. Вкъщи си почива.",
    "Как я докара тая усмивка, бе? Още ли беше платено парното?",
    "I look responsible in that photo. The photographer must have been quick.",
    "I’ll put it away. Two of me in one room is already a meeting.",
    "That smile’s for company. At home it gets the day off.",
    "How did you manage that smile? Had someone paid the heating bill?"
  ],
  "hotspot.apartment.rakia_bottle": [
    "Домашна. Още щом я помиришеш, забравяш чия къща е.",
    "Ако я вдигна, ще трябва да кажа тост. А още не сме избрали повод.",
    "Отварям я само при важни случаи. Случаите напоследък са много важни.",
    "Шшшт. Тая бутилка знае как съм пял на сватбата.",
    "Homemade. One sniff and you forget whose home.",
    "If I lift it, somebody will expect a toast. We haven’t picked an occasion.",
    "I open it on important occasions. Lately they’ve all seemed important.",
    "Shh. This bottle knows what I sang at the wedding."
  ],
  "hotspot.apartment.bed": [
    "Пружините знаят за мен повече от личния лекар.",
    "Исках да си взема съня, ама май върви с леглото.",
    "Ще легна за пет минути. Така започна и миналата зима.",
    "Само проскърцай, ако и ти мислиш, че е рано.",
    "Those springs know more about me than my doctor does.",
    "I’d take my nap with me, but I think the bed comes with it.",
    "I’ll lie down for five minutes. That’s how last winter started.",
    "Give us a squeak if you think it’s too early as well."
  ],
  "hotspot.apartment.mirror": [
    "Пукнатината точно ми дели лицето на предизборно и следизборно.",
    "Ако го сваля, кой ще ми напомня какво съм обещал сутринта?",
    "За бръснене става, ако си избереш предварително коя буза е твоята.",
    "Кажи ми истината. Само не всички парчета наведнъж.",
    "That crack divides my face into before and after the election.",
    "If I take it down, who’ll remind me what I promised this morning?",
    "Fine for shaving, once you decide which cheek is yours.",
    "Tell me the truth. One piece at a time, please."
  ],
  "hotspot.apartment.tv": [
    "На екрана всичко върви по план. Явно планът е да дават повторения.",
    "Не мога да го изнеса. Новините ще тръгнат след мен.",
    "Я да видя дали пак са намерили начин да обявят вчера за успех.",
    "Говорих им веднъж. На другия ден пак бяха в ефир.",
    "Everything’s going to plan on television. The plan appears to be repeats.",
    "I can’t carry that out. The news would follow me.",
    "Let’s see if they’ve found another way to declare yesterday a success.",
    "I had a word with them once. They were back on the air the next day."
  ],
  "hotspot.apartment.wardrobe": [
    "Панталоните тук са подредени по години и по обиколка.",
    "Ако го взема целия, най-сетне ще се наложи да го подредя.",
    "Отварям внимателно. Горният рафт е по-стар от застраховката ми.",
    "Какво криеш? Освен дрехите, дето вече не ми стават.",
    "The trousers are filed by year and waistline.",
    "If I take the whole thing, I might finally have to tidy it.",
    "Easy with that door. The top shelf predates my insurance.",
    "What are you hiding? Apart from everything I can’t fit into."
  ],
  "hotspot.apartment.table": [
    "Покривката е на цветя. Под нея е по-скоро археология.",
    "Тая маса няма да мине през вратата. И сметките ще се зарадват.",
    "Става за семейно събрание. Особено ако не поканиш семейството.",
    "Масо, ти поне знаеш кой е разлял. Дръж си го за себе си.",
    "Flowers on the tablecloth. Underneath, it’s mostly archaeology.",
    "This table won’t fit through the door. The bills will be delighted.",
    "Good for a family meeting, especially if you forget to invite the family.",
    "You know who spilled it, table. Let’s keep that between us."
  ],
  "hotspot.apartment.icon": [
    "Гледа ме с търпението на човек, който е чувал и предишните ми обещания.",
    "Остава си там. И без това съвестта ми е трудно преносима.",
    "Тук се моля. За по-големите неща подавам и писмено.",
    "Обещах да съм по-добър. Никой не каза от кой понеделник.",
    "She looks at me with the patience of someone who’s heard my previous promises.",
    "She stays. My conscience is hard enough to carry as it is.",
    "I pray here. For bigger requests I also put it in writing.",
    "I promised I’d do better. Nobody specified which Monday."
  ],
  "hotspot.apartment.lamp": [
    "Свети само в средата. По ъглите си пазя младостта.",
    "Ако я сваля, таванът ще изглежда още по-необитаем.",
    "Една крушка стига. За всичките ми идеи даже е много.",
    "Светни ми по въпроса. Не буквално, че пак ще дойде сметката.",
    "It only lights the middle. I keep my youth in the corners.",
    "If I take it down, the ceiling will look even less inhabited.",
    "One bulb is plenty. For all my ideas, it may be excessive.",
    "Shedding light on the matter? Keep it brief. I pay the bill."
  ],
  "hotspot.apartment.suitcase": [
    "Куфарът още си мисли, че ще види Виена.",
    "Не го свалям. Като го видя на пода, все ми се тръгва.",
    "Идеален за пътуване, стига да не плащаш за свръхбагаж от спомени.",
    "Спокойно, приятелю. Тая година ще видим поне автогарата.",
    "That suitcase still thinks it’s going to Vienna.",
    "I’m leaving it up there. Put it on the floor and I’ll start wanting to leave.",
    "Ideal for travel, provided memories don’t count as excess baggage.",
    "Easy, friend. This year we might make it as far as the bus station."
  ],
  "hotspot.apartment.bag": [
    "Дръжките са по-уморени от човека, дето я носи.",
    "Ако я взема, ще ме помислят за човек с работа.",
    "Става за покупки. Трябва само да преживея цените.",
    "Какво има вътре? Отговорът пак мирише на нафталин.",
    "The handles look more tired than the man who carries it.",
    "If I take it, people might think I have somewhere to be.",
    "Good for shopping, if I survive looking at the prices.",
    "What’s inside? Even the answer smells of mothballs."
  ],
  "hotspot.apartment.plant": [
    "Расте без план, без комисия и без да ме пита. Направо обидно.",
    "Остава на прозореца. Там поне има перспектива.",
    "Поливам го пестеливо. Да не свиква с лукса.",
    "Как е, колега? Мълчиш, ама поне даваш листа.",
    "It grows without a plan, a committee or my permission. Frankly insulting.",
    "It stays by the window. There’s a future for it there.",
    "I water it sparingly. No point getting it used to luxury.",
    "How’s it going, colleague? Quiet, but at least you produce something."
  ],
  "hotspot.apartment.radiator": [
    "Зимата е студен. През лятото е също толкова убедителен.",
    "Ще го оставя. Нямам джоб за него, нито бюджет за сметката.",
    "От него очаквам топлина. Всеки януари имаме тоя разговор.",
    "Драги радиаторе, пак ли се познаваме само по фактура?",
    "Cold in winter. Equally convincing in summer.",
    "I’ll leave it. No pocket that large and no budget for the bill.",
    "I expect heat from it. We have this conversation every January.",
    "Dear radiator, are we still only corresponding by invoice?"
  ],
  "hotspot.apartment.empty_frame": [
    "Абстрактен автопортрет. Критиците казват, че съм се уловил добре.",
    "Остава. Иначе ще гледам дупките от пироните.",
    "Ще го ползвам, като ми потрябва рамка за нищото.",
    "Кажи нещо. Празната ти физиономия е направо професионална.",
    "An abstract self-portrait. The critics say it captures me perfectly.",
    "It stays. Otherwise I’ll have to look at the nail holes.",
    "I’ll use it when I need to frame nothing in particular.",
    "Say something. That blank expression of yours is downright professional."
  ],
  "hotspot.apartment.wall_rug": [
    "Като го закачих, подът въздъхна от облекчение.",
    "Ако го сваля, стената пак ще трябва да се държи прилично.",
    "Не е за бърсане на крака. Стената ми е възпитана.",
    "И ти ли висиш тук от години без повишение?",
    "When I hung it up, the floor breathed a sigh of relief.",
    "If I take it down, the wall will have to make itself presentable again.",
    "It’s not for wiping feet. My wall has manners.",
    "You’ve been hanging around here for years without a promotion too?"
  ],
  "hotspot.apartment.patriot_photos": [
    "По физиономиите им личи, че и като бебе са ми искали отчет.",
    "Не ги изнасям. Тая роднина и на снимка ще пита къде я водя.",
    "Подреждам ги само по ръст. По заслуги пак ще се скарат.",
    "Добър ден. Както винаги, гледате така, сякаш сте ми проверили касата.",
    "Judging by their faces, they asked me for receipts even as a baby.",
    "I’m leaving them there. That aunt would ask where we’re going even in a photo.",
    "I arrange them by height. Rank would start the argument all over again.",
    "Good afternoon. As usual, you look like you’ve gone through my accounts."
  ],
  "hotspot.square.empty_envelope": [
    "Празен плик. По съдържание прилича на много важни писма.",
    "Прибирам го. Поне е лек като обещание.",
    "Мога да го запечатам. Ще изглежда още по-съдържателен.",
    "Какво носиш за мен? Е, поне не е сметка.",
    "An empty envelope. Remarkably similar in content to most important letters.",
    "I’ll pocket it. Light as a promise, at least.",
    "I could seal it. It might look even more substantial.",
    "What have you brought me? Well, at least it isn’t a bill."
  ],
  "hotspot.square.poster_board": [
    "Тук лепят обещания върху обещания. Дъската вече е носеща.",
    "Ще оставя дъската. И без нея обещанията едва се държат.",
    "Дъската е виждала толкова кампании, че сама може да даде интервю.",
    "Кажи ми кой ще спечели. Ти си им виждала гърбовете.",
    "Promises pasted over promises. By now the board is load-bearing.",
    "I’ll leave it here. Those promises are barely holding up as it is.",
    "This board’s seen enough campaigns to give its own interview.",
    "Tell me who’ll win. You’ve seen the back of all of them."
  ],
  "hotspot.square.fountain": [
    "Най-скъпата купа в селото. Гълъбите плащат само с присъствие.",
    "В джоба няма да влезе. В бюджета обаче е влязъл целият.",
    "Фонтанът е общински. Дори да имаш желание, ще почака.",
    "И ти ли си в почивка, или така си назначен?",
    "The most expensive bowl in the village. Pigeons pay by showing up.",
    "It won’t fit in my pocket. There was room for all of it in the budget, though.",
    "Municipal fountain. Even if you’re keen, there’ll be a wait.",
    "Are you on a break, or were you hired like that?"
  ],
  "hotspot.square.kiosk": [
    "Пепа чете площада по-бързо, отколкото хората четат вестника.",
    "Пепа ще ми даде будката, когато улицата престане да минава пред нея.",
    "Тук и да купиш само вестник, ще си тръгнеш с устно допълнение.",
    "Лельо Пепа, може ли за минутка? Моите минути са по-евтини от твоите.",
    "Pepa reads the square faster than most people read the newspaper.",
    "Pepa will give me the kiosk when the street stops passing by it.",
    "Buy a paper here and you still get the oral supplement.",
    "Aunt Pepa, got a minute? Mine are cheaper than yours."
  ],
  "hotspot.square.statue": [
    "Бронзовият човек стои на пост без заплата. Затова още го има.",
    "Ще го оставя. Поне тоя обществен служител се вижда къде е.",
    "От бронза се иска търпение. Него поне го доставиха навреме.",
    "Другарю, кажи една дума. Гледам, че и ти чакаш отговор от общината.",
    "A bronze man on duty without pay. That explains why he’s still here.",
    "I’ll leave him. At least we know where this public servant is.",
    "Bronze requires patience. At least they delivered that part on time.",
    "Say a word, comrade. I see town hall hasn’t got back to you either."
  ],
  "hotspot.square.election_notice": [
    "Пише, че всичко е прозрачно. Светлината не минава през хартията.",
    "Ако го взема, ще излезе, че съм укрил информация. Аз само я прочетох.",
    "Ще го използвам за справка, когато ми потрябва какво е трябвало да стане.",
    "Плакатче, кой ти е писал такъв уверен почерк?",
    "It says everything is transparent. Light seems to disagree.",
    "If I take that, I’ll be accused of withholding information. I only read it.",
    "I’ll consult it when I need to know what was supposed to happen.",
    "Who taught you to sound so certain, little notice?"
  ],
  "hotspot.square.mehana_menu": [
    "Киро е написал менюто с тебешир. И грамовете му се трият лесно.",
    "Табелата остава. Киро после ще ми я пише на сметката.",
    "По тебешира не се поръчва. Още не сме чак толкова модерни.",
    "Табело, защо на теб не ти пишат вересиите?",
    "Kiro wrote the menu in chalk. Makes the portion sizes easy to rub out.",
    "The board stays. Kiro would put it on my tab.",
    "You can’t order through chalk. We aren’t that modern yet.",
    "Tell me, board. Why don’t they put your drinks on credit?"
  ],
  "hotspot.mehana.tony_rakia_glass": [
    "Тони мери до ръба. Математиката му е щедра.",
    "Чашата му остава. Още помня как ме погледна за салфетката.",
    "Тая чаша има собственик и добра памет за отпечатъци.",
    "Наздраве, чашо. Кажи на стопанина ти, че беше от възпитание.",
    "Tony measures right to the brim. Generous arithmetic.",
    "His glass stays. I remember the look he gave me over a napkin.",
    "That glass has an owner and a good memory for fingerprints.",
    "Cheers, glass. Tell your owner I was just being polite."
  ],
  "hotspot.mehana.table": [
    "Масата е стабилна, стига никой да не започне да говори за политика.",
    "Четирима я местят. Трима ще се правят, че им звъни телефонът.",
    "Тук се сяда. За ставането се плаща отделно, обикновено след сметката.",
    "Масо, ти си чувала всичко. Само не кимай, че пак ще те подпираме.",
    "The table’s steady until somebody brings up politics.",
    "Takes four to move it. Three will pretend they’re getting a call.",
    "You sit down here. Getting back up costs extra, usually after the bill.",
    "You’ve heard it all, table. Don’t nod or we’ll have to wedge you again."
  ],
  "hotspot.mehana.oil": [
    "Етикетът обещава слънце. Салатата ще трябва да потвърди.",
    "Няма да си го прибера. Киро брои бутилките по-внимателно от монетите.",
    "Ще оставя домакинството на Киро. Той сипва като човек с касов апарат.",
    "Кажи честно, колко слънчогледа са те подписали?",
    "The label promises sunshine. The salad will have to confirm.",
    "I won’t pocket it. Kiro counts bottles more carefully than coins.",
    "I’ll leave the pouring to Kiro. He measures like a man with a cash register.",
    "Tell me honestly, how many sunflowers signed off on you?"
  ],
  "hotspot.mehana.newspaper": [
    "Заглавието е с едри букви. Така не се вижда колко е тънка новината.",
    "Остава тук. На половината село му трябва, за да си подложи под чашата.",
    "Ще си го прочета на сухо. В тая кръчма и това си е амбиция.",
    "Вестнико, утре пак ли ще сме изненадани от вчера?",
    "The headline is huge. That hides how thin the news is.",
    "It stays. Half the village needs it as a coaster.",
    "I’ll read it somewhere dry. In this tavern that’s an ambition.",
    "Say, paper, will we be surprised by yesterday again tomorrow?"
  ],
  "hotspot.mehana.radio": [
    "Говорителят е на батерии. Увереността му явно е на ток.",
    "Ако го взема, новините ще ме намерят и вкъщи.",
    "Ще оставя копчето намира. И без това всички станции знаят едно и също.",
    "Чуваш ли ме? Естествено. Ти само говориш.",
    "The announcer runs on batteries. His confidence is plugged into the mains.",
    "If I take it, the news will find me at home too.",
    "I’ll leave the dial alone. Every station knows the same thing anyway.",
    "Can you hear me? Of course. You only ever talk."
  ],
  "hotspot.mehana.cellar_hatch": [
    "Тая врата е единствената тук, дето пази входа си с гравитация.",
    "Капакът остава. Нямам с какво да покрия дупка в пода и дупка в бюджета.",
    "Ще оставя мазето на хората, дето знаят броя на стъпалата.",
    "Има ли някой долу? Ако е понеделник, кажете му, че ме няма.",
    "The only door here that guards its entrance with gravity.",
    "The lid stays. I can’t cover a hole in the floor and one in the budget.",
    "I’ll leave the cellar to the people who know how many steps there are.",
    "Anybody down there? If it’s Monday, tell it I’m out."
  ],
  "hotspot.mehana.ballot_box": [
    "Прозрачна урна. Поне съм сигурен каква боя има под нея.",
    "Няма да я разнасям из кръчмата. После ще броят бакшишите като гласове.",
    "Не смесвам изборите с кръчмата. И двете имат достатъчно оспорвани сметки.",
    "Чуваш ли народа, урно? Сега е зает с обяда.",
    "A transparent ballot box. At least I can see what colour’s underneath.",
    "I won’t carry it around the tavern. They’ll count the tips as votes.",
    "I don’t mix elections with the tavern. Both have enough disputed bills.",
    "Can you hear the people, box? They’re having lunch at the moment."
  ],
  "hotspot.mehana.tony_diploma": [
    "Тони слага дипломата до чашата. Две причини да седне отпред на снимката.",
    "Единствената диплома, дето и в кръчмата си има охрана.",
    "Не се работи с чужда диплома. Особено на масата на собственика.",
    "Поздравления. От толкова години слушаш за абсолютно същия изпит.",
    "Tony sits his diploma beside his glass. Two reasons to put him in the front row of the photo.",
    "The only diploma with its own protection even at the tavern.",
    "You don’t put somebody else’s diploma to work at the owner’s table.",
    "Congratulations. All these years and you’re still hearing about the same exam."
  ],
  "hotspot.municipality.candidate_register": [
    "Тая книга е толкова дебела, че накрая и празните места тежат.",
    "Книгата остава. Тук и за изнасяне на запетая искат опис.",
    "Отварям я внимателно. Тежките книги имат навика да затварят разговора.",
    "Драги регистре, поне ти не питай майка ми какво работя.",
    "This book is so thick that even the blank spaces weigh something.",
    "It stays. In this building you need a receipt to remove a comma.",
    "Easy opening it. Big books have a way of closing the conversation.",
    "Dear register, at least don’t ask my mother what I do for a living."
  ],
  "hotspot.municipality.stamp_desk": [
    "Оттук и празният лист си тръгва с повече авторитет от мен.",
    "Няма да го нося. Ще поискат печат за самия печат.",
    "Ще си оставя ръцете в джоба. И без това мастилото тук има характер.",
    "Колко тежи мнението ти? Едно тупване, ясно.",
    "Even a blank sheet leaves this desk with more authority than I have.",
    "I won’t carry it. They’ll want the stamp stamped.",
    "I’ll keep my hands in my pockets. The ink here has a temper.",
    "What does your opinion weigh? One thump. Understood."
  ],
  "hotspot.municipality.archive_cabinet": [
    "Шкафът пази миналото. Прахът пази шкафа.",
    "Който мести архив, сам става част от документацията.",
    "Ще го отворя внимателно. Не ми се събуждат минали управления.",
    "Помниш ли ме? Не се напрягай. Тука и живите не ме помнят.",
    "The cabinet keeps the past. The dust keeps the cabinet.",
    "Move an archive and you become part of the paperwork.",
    "Easy opening it. No sense waking any previous administrations.",
    "Remember me? Don’t strain yourself. Even the living here don’t."
  ],
  "hotspot.archive.handle": [
    "Тая дръжка се държи като чиновник в петък следобед.",
    "Ако взема само дръжката, останалото пак ще се води ремонтирано.",
    "Дръжката има характер. За жалост и шкафът има такъв.",
    "Ти вече и за здравей ли искаш писмена молба?",
    "That handle behaves like a civil servant on Friday afternoon.",
    "If I take just the handle, the rest will still be listed as repaired.",
    "The handle’s got a personality. Unfortunately so does the cabinet.",
    "Do you want a written application just to say hello?"
  ],
  "hotspot.archive.ledger": [
    "Толкова старателно описано. Чак ми е неудобно, че нещо се е случило.",
    "Не го местя. Ще ми заведат липсата на мястото му.",
    "Тая книга е за четене на спокойствие. Властта обича дребния шрифт.",
    "Колега, ти за празна страница имаш ли протокол?",
    "Meticulously recorded. I almost feel bad that something happened.",
    "I won’t move it. They’ll file its absence in the space it leaves.",
    "Best read in a quiet room. Authority loves small print.",
    "Colleague, do you have minutes for a blank page?"
  ],
  "hotspot.archive.jar": [
    "Киселите краставички са единствените тук с ясно отбелязан срок.",
    "Ще го вдигна внимателно. Саламурата не признава служебни прегради.",
    "Архивът има силна миризма за място, дето уж пази тайни.",
    "Как сте вътре? Мълчите, ама така се трае.",
    "The pickles are the only things in here with a clear expiry date.",
    "I’ll lift it carefully. Brine respects no departmental boundaries.",
    "For somewhere that keeps secrets, the archive has a strong smell.",
    "How’s it going in there? Quiet. Good way to get through it."
  ],
  "hotspot.archive.ballot_box": [
    "Прозрачна отвсякъде. И въпреки това все някой ще поиска проверка.",
    "Вдигам я. По-лека е от обясненията как е стигнала тук.",
    "Откакто е прозрачна, всички внимават как изглеждат отстрани.",
    "Помниш ли кога за последно имаше вътре нещо по-тежко от обещание?",
    "Transparent on all sides. Someone will still demand an inspection.",
    "I’ll lift it. It weighs less than the explanations for how it got here.",
    "Since they made it transparent, everybody worries how they look from the side.",
    "When did you last hold anything heavier than a promise?"
  ],
  "hotspot.archive.replacement": [
    "Има заместник. В общината и предметите си имат кадрова политика.",
    "Нека остане. Достатъчно хора вече са го приели на работа.",
    "Този съд е назначен. Единствено не знам дали има обедна почивка.",
    "Как е на новото място? Поне си на сухо.",
    "It has a replacement. Even the objects here have a staffing policy.",
    "It can stay. Enough people have already signed off on hiring it.",
    "That container’s been appointed. No word on a lunch break yet.",
    "How’s the new job? At least it’s indoors."
  ],
  "hotspot.mayor_office.desk": [
    "На това бюро и листите чакат, докато кметът ги приеме.",
    "Да го взема? Отдолу сигурно е завинтено за мандата.",
    "Ще се опра другаде. Бюрото вече носи тежестта на цяла община.",
    "Бюро, кажи ми само кога ти е приемният ден.",
    "Even sheets of paper have to wait for the mayor at that desk.",
    "Take it? It’s probably bolted to his term of office.",
    "I’ll lean somewhere else. That desk already carries the whole municipality.",
    "Tell me, desk. Which days do you see the public?"
  ],
  "hotspot.election_booth.commission_table": [
    "Масата е безпристрастна. Клати се еднакво и в двете посоки.",
    "Остава. Иначе ще обжалват и липсата на маса.",
    "Ще си държа лактите прибрани. Тук и на тях могат да им поискат лична карта.",
    "Масо, пази спокойствие. Виждам, че и ти си на четири крака от сутринта.",
    "An impartial table. It wobbles equally in both directions.",
    "It stays. Otherwise they’ll appeal the absence of a table too.",
    "I’ll keep my elbows to myself. Even they might get asked for ID in here.",
    "Keep calm, table. I see you’ve been on four feet since morning too."
  ],
  "window": [
    "Стъклото гледа навън по-често от мен.",
    "Ще го оставя. Не мога да си нося и гледката.",
    "Да пуснем малко въздух. Той поне не начислява такса.",
    "Е, прозорец, какво става навън освен течението?",
    "The glass gets out more often than I do.",
    "I’ll leave it. I can’t take the view along too.",
    "Let’s let in some air. It doesn’t charge a fee yet.",
    "So, window, what’s happening outside besides a draught?"
  ],
  "window.open": [
    "Гледката е същата, само че с отоплителни последици.",
    "Ако го сваля, съседите ще чуят още по-добре.",
    "Стига толкова свеж въздух. Почна да ми идва акъл.",
    "Ало, вятъра! По-тихо, че ни чуват отсреща.",
    "Same view, with consequences for the heating.",
    "If I take it down, the neighbours will hear even better.",
    "Enough fresh air. I was starting to get ideas.",
    "Hey, wind! Keep it down. They can hear us across the street."
  ]
};

export function objectRemark(targetId, verb, language) {
  const index = verbs.indexOf(verb);
  return index < 0 ? undefined : remarks[targetId]?.[index + (language === 'en' ? verbs.length : 0)];
}
