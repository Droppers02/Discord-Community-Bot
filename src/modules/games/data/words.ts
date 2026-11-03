// Palavras dos jogos (português de Portugal). Os acentos ficam para mostrar; para adivinhar,
// conta só a letra base (Ã → A, Ç → C), como no papel.

export interface HangmanWord {
    word: string;
    hint: string;
    category: string;
}

export const HANGMAN_CATEGORIES = ["Animais", "Comida", "Países e cidades", "Desporto", "Profissões", "Objetos", "Natureza", "Música e arte", "Tecnologia", "Portugal"] as const;

const W = (category: string, list: Array<[string, string]>): HangmanWord[] => list.map(([word, hint]) => ({ word, hint, category }));

export const HANGMAN_WORDS: HangmanWord[] = [
    ...W("Animais", [
        ["ELEFANTE", "Tem tromba e memória famosa"], ["GIRAFA", "O pescoço mais comprido da savana"], ["CROCODILO", "Réptil de rio com dentes à mostra"],
        ["PINGUIM", "Ave que não voa mas nada muito bem"], ["CANGURU", "Salta e traz o filho no bolso"], ["GOLFINHO", "Mamífero marinho muito inteligente"],
        ["BORBOLETA", "Antes de voar foi lagarta"], ["CAMALEÃO", "Muda de cor conforme o sítio"], ["ESQUILO", "Guarda nozes para o inverno"],
        ["TUBARÃO", "Predador dos mares com barbatana à vista"], ["HIPOPÓTAMO", "Passa o dia dentro de água em África"], ["PAPAGAIO", "Ave que imita a voz humana"],
        ["CORUJA", "Ave da noite com olhos enormes"], ["TARTARUGA", "Anda devagar e traz a casa às costas"], ["ORNITORRINCO", "Mamífero com bico de pato que põe ovos"],
        ["LINCE", "Felino ibérico em risco de extinção"], ["MORCEGO", "Mamífero que voa de noite"], ["MEDUSA", "Gelatinosa e pica na praia"],
    ]),
    ...W("Comida", [
        ["FRANCESINHA", "Sanduíche do Porto com molho"], ["BACALHAU", "Há mil e uma receitas dele"], ["CHOURIÇO", "Enchido que se assa no álcool"],
        ["PASTEL DE NATA", "Doce de Belém com canela"], ["ARROZ DOCE", "Sobremesa com canela por cima"], ["SARDINHA", "Rainha dos Santos Populares"],
        ["BIFANA", "Pão com carne de porco temperada"], ["CALDO VERDE", "Sopa de couve com rodela de chouriço"], ["ESPARGUETE", "Massa comprida e fina"],
        ["CHOCOLATE", "Feito a partir do cacau"], ["GELADO", "Sobremesa fria de verão"], ["HAMBÚRGUER", "Carne no pão, com batatas ao lado"],
        ["PANQUECA", "Fina, redonda e com xarope"], ["MORANGO", "Fruta vermelha com sementes por fora"], ["ANANÁS", "Fruta com coroa (nos Açores há muitos)"],
        ["AZEITONA", "Dá azeite"], ["TREMOÇO", "Petisco amarelo com a cerveja"], ["BOLA DE BERLIM", "Vende-se na praia com creme"],
    ]),
    ...W("Países e cidades", [
        ["AUSTRÁLIA", "País-continente dos cangurus"], ["NORUEGA", "Terra dos fiordes"], ["MARROCOS", "Vizinho de Portugal do outro lado do mar"],
        ["ISLÂNDIA", "Ilha de gelo e vulcões"], ["ARGENTINA", "Terra do tango e do Messi"], ["JAPÃO", "País do sol nascente"],
        ["MOÇAMBIQUE", "País lusófono na costa oriental de África"], ["CABO VERDE", "Ilhas lusófonas no Atlântico"], ["VENEZA", "Cidade italiana com canais"],
        ["AMESTERDÃO", "Capital das bicicletas e dos canais"], ["BARCELONA", "Cidade da Sagrada Família"], ["NOVA IORQUE", "A Grande Maçã"],
        ["ÍNDIA", "País do Taj Mahal"], ["EGITO", "País das pirâmides"], ["CANADÁ", "Tem uma folha de ácer na bandeira"],
    ]),
    ...W("Desporto", [
        ["FUTEBOL", "O desporto-rei"], ["BASQUETEBOL", "Cestos e triplos"], ["ANDEBOL", "Joga-se com as mãos e marca-se golos"],
        ["NATAÇÃO", "Desporto na piscina"], ["CICLISMO", "Volta a Portugal em bicicleta"], ["SURF", "Na Nazaré há ondas gigantes para isto"],
        ["MARATONA", "Prova de 42 quilómetros"], ["XADREZ", "Desporto mental com reis e rainhas"], ["VOLEIBOL", "Rede alta e bola por cima"],
        ["GUARDA-REDES", "Defende a baliza"], ["PENÁLTI", "Remate da marca dos onze metros"], ["ESGRIMA", "Combate com floretes"],
        ["SKATE", "Tábua com rodas"], ["TÉNIS", "Raquete, rede e bola amarela"],
    ]),
    ...W("Profissões", [
        ["BOMBEIRO", "Apaga fogos"], ["ASTRONAUTA", "Trabalha no espaço"], ["CARPINTEIRO", "Trabalha a madeira"],
        ["ENFERMEIRO", "Cuida dos doentes no hospital"], ["PROGRAMADOR", "Escreve código"], ["ARQUITETO", "Desenha edifícios"],
        ["CANALIZADOR", "Arranja canos (o Mario também)"], ["JORNALISTA", "Escreve as notícias"], ["PASTELEIRO", "Faz bolos e doces"],
        ["VETERINÁRIO", "Médico dos animais"], ["ELETRICISTA", "Mexe nos fios lá de casa"], ["PILOTO", "Conduz aviões"],
    ]),
    ...W("Objetos", [
        ["GUARDA-CHUVA", "Abre-se quando chove"], ["CANDEEIRO", "Ilumina a sala"], ["FRIGORÍFICO", "Mantém a comida fria"],
        ["TESOURA", "Corta papel"], ["ESCOVA DE DENTES", "Usa-se três vezes por dia"], ["COMANDO", "Muda os canais da TV"],
        ["MOCHILA", "Leva-se às costas para a escola"], ["CADEIRA", "Senta-te nela"], ["ESPELHO", "Mostra o teu reflexo"],
        ["BICICLETA", "Duas rodas e pedais"], ["AUSCULTADORES", "Ouves música sem incomodar ninguém"], ["CALCULADORA", "Faz contas por ti"],
        ["DESPERTADOR", "Toca de manhã"], ["CHAVE", "Abre portas"],
    ]),
    ...W("Natureza", [
        ["CASCATA", "Água a cair de uma rocha"], ["VULCÃO", "Montanha que deita lava"], ["ARCO-ÍRIS", "Aparece com sol e chuva"],
        ["FLORESTA", "Muitas árvores juntas"], ["TROVOADA", "Relâmpagos e barulho no céu"], ["MONTANHA", "Elevação muito alta"],
        ["DESERTO", "Areia e pouca água"], ["OCEANO", "Grande massa de água salgada"], ["GIRASSOL", "Flor que segue o sol"],
        ["CATO", "Planta com picos do deserto"], ["NEVOEIRO", "Nuvem junto ao chão"], ["ECLIPSE", "A Lua tapa o Sol"],
    ]),
    ...W("Música e arte", [
        ["GUITARRA", "Instrumento de seis cordas"], ["BATERIA", "Pratos e tambores"], ["SAXOFONE", "Instrumento de sopro do jazz"],
        ["FADO", "Música portuguesa património da humanidade"], ["ORQUESTRA", "Muitos músicos com um maestro"], ["ESCULTURA", "Arte de esculpir"],
        ["PINTURA", "Arte com pincéis e tintas"], ["MICROFONE", "Serve para cantar mais alto"], ["VIOLINO", "Toca-se com um arco"],
        ["CONCERTO", "Espetáculo de música ao vivo"], ["ACORDEÃO", "Instrumento com fole"],
    ]),
    ...W("Tecnologia", [
        ["COMPUTADOR", "Máquina onde estás a ler isto (ou não)"], ["TECLADO", "Tem teclas"], ["INTERNET", "Rede de redes"],
        ["DISCORD", "Onde estamos agora"], ["SMARTPHONE", "Telemóvel inteligente"], ["ALGORITMO", "Passos para resolver um problema"],
        ["SERVIDOR", "Computador que serve outros (e um sítio no Discord)"], ["PALAVRA-PASSE", "Não a partilhes com ninguém"], ["CONSOLA", "PlayStation, Xbox ou Switch"],
        ["IMPRESSORA", "Põe o documento em papel"], ["ROUTER", "Distribui o Wi-Fi"], ["BATERIA EXTERNA", "Carrega o telemóvel fora de casa"],
    ]),
    ...W("Portugal", [
        ["LISBOA", "Capital de Portugal"], ["MADEIRA", "Ilha do vinho e do Cristiano"], ["AÇORES", "Nove ilhas no Atlântico"],
        ["ALENTEJO", "Planícies e montado de sobro"], ["ALGARVE", "Praias do sul"], ["COIMBRA", "Cidade dos estudantes"],
        ["SERRA DA ESTRELA", "Tem neve e queijo famoso"], ["GALO DE BARCELOS", "Símbolo nacional colorido"], ["AZULEJO", "Ladrilho pintado nas fachadas"],
        ["SAUDADE", "Palavra que não se traduz"], ["CAMÕES", "Escreveu Os Lusíadas"], ["CORTIÇA", "Somos o maior produtor do mundo"],
    ]),
];

/** Palavras do Termo — 5 letras. */
export const TERMO_WORDS: string[] = [
    "AMIGO", "FESTA", "PRAIA", "LIVRO", "CARRO", "CHUVA", "NOITE", "TARDE", "VERDE", "PRETO", "BRAÇO", "PEDRA", "PAPEL", "LÁPIS",
    "CAMPO", "PORTA", "PLANO", "SONHO", "FOLHA", "FRUTA", "PEIXE", "CARNE", "MOLHO", "ARROZ", "MASSA", "LIMÃO", "MANGA", "MELÃO",
    "TIGRE", "ZEBRA", "CABRA", "COBRA", "POLVO", "MOSCA", "PULGA", "GANSO", "CORVO", "POMBO", "LEBRE", "PANDA", "KOALA", "BURRO",
    "PORCO", "CISNE", "CAIXA", "GARFO", "PRATO", "CHAVE", "CORDA", "BOLSA", "CINTO", "GORRO", "BANCO", "MÓVEL", "RÁDIO", "VÍDEO",
    "DISCO", "MOTOR", "AVIÃO", "BARCO", "METRO", "PONTE", "TORRE", "TELHA", "MONTE", "SERRA", "PRADO", "VENTO", "NUVEM", "TERRA",
    "SOLAR", "LUNAR", "ASTRO", "CRAVO", "LÍRIO", "AREIA", "ROCHA", "BARRO", "PERNA", "NARIZ", "DENTE", "LÁBIO", "PEITO", "OMBRO",
    "CORPO", "RAIVA", "CALMA", "SORTE", "HONRA", "FORÇA", "PODER", "TEMPO", "MUNDO", "MORTE", "SAÚDE", "PRAZO", "GRAÇA", "PIADA",
    "FELIZ", "LENTO", "FORTE", "FRACO", "LARGO", "CURTO", "LONGO", "BAIXO", "CLARO", "LIMPO", "MORNO", "CHEIO", "VAZIO", "VELHO",
    "JOVEM", "LINDO", "BRAVO", "CALVO", "GORDO", "MAGRO", "POBRE", "NOBRE", "LIVRE", "SÉRIO", "JOGAR", "DANÇA", "CANTO", "NADAR",
    "SALTO", "LUTAR", "COMER", "BEBER", "FALAR", "OUVIR", "ANDAR", "VOLTA", "PASSE", "CHUTO", "CARTA", "LETRA", "TEXTO", "FRASE",
    "VERSO", "POEMA", "FILME", "SÉRIE", "PIANO", "VIOLA", "BANDA", "PALCO", "TURMA", "PROVA", "EXAME", "CLUBE", "PIZZA", "TARTE",
    "PUDIM", "NATAS", "TOSTA", "SALSA", "CALDO", "LEITE", "VINHO", "PORTO", "BRAGA", "ÉVORA", "VISEU", "VIANA", "TOMAR", "PARIS",
    "MILÃO", "CHINA", "JAPÃO", "ÍNDIA", "EGITO", "SUÍÇA", "CHILE", "MALTA", "NEPAL", "TECLA", "PIXEL", "DADOS", "LOGIN", "SENHA",
    "GRITO", "BEIJO", "ABRIR", "FECHO", "SINAL", "PRAÇA", "FEIRA", "CESTO", "GRUPO", "PLACA", "GLOBO", "FAROL", "CANAL", "TRAVE",
    "FINTA", "RELVA", "TACHO", "FORNO", "BOLHA", "SABÃO", "LENÇO", "CHAPA", "PÓDIO",
];
