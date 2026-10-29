type Group = readonly [string, string];

function wordsFromGroups(groups: Group[]) {
  return groups.flatMap(([unit, rows]) => rows.trim().split("\n").map((row) => {
    const separator = row.indexOf("|");
    if (separator < 1) throw new Error(`Invalid sample word: ${row}`);
    return { english: row.slice(0, separator).trim(), japanese: row.slice(separator + 1).trim(), unit };
  })).map((word, index) => ({ no: index + 1, label: String(index + 1), ...word }));
}

const english = wordsFromGroups([
  ["動作", `accept|受け入れる
achieve|達成する
add|加える
allow|許す
answer|答える
appear|現れる
arrive|到着する
ask|尋ねる
avoid|避ける
believe|信じる`],
  ["日常の動詞", `borrow|借りる
bring|持ってくる
build|建てる
choose|選ぶ
collect|集める
compare|比べる
continue|続ける
create|作る
decide|決める
deliver|届ける`],
  ["学習の動詞", `describe|説明する
discover|発見する
discuss|話し合う
explain|説明する
explore|探る
focus|集中する
imagine|想像する
improve|改善する
learn|学ぶ
notice|気づく`],
  ["人と関わる", `agree|同意する
apologize|謝る
communicate|伝え合う
encourage|励ます
invite|招く
introduce|紹介する
listen|聞く
promise|約束する
respect|尊重する
support|支える`],
  ["生活の名詞", `address|住所
appointment|約束
breakfast|朝食
calendar|カレンダー
community|地域社会
conversation|会話
document|書類
exercise|運動
habit|習慣
schedule|予定`],
  ["自然の名詞", `climate|気候
coast|海岸
earth|地球
energy|エネルギー
forest|森林
island|島
mountain|山
ocean|海洋
river|川
weather|天気`],
  ["学びの名詞", `chapter|章
example|例
experiment|実験
knowledge|知識
language|言語
lesson|授業
meaning|意味
method|方法
question|質問
result|結果`],
  ["社会の名詞", `culture|文化
economy|経済
education|教育
government|政府
history|歴史
industry|産業
population|人口
public|一般の人々
society|社会
tradition|伝統`],
  ["形容詞", `accurate|正確な
available|利用できる
common|一般的な
curious|好奇心の強い
different|異なる
effective|効果的な
familiar|よく知っている
necessary|必要な
possible|可能な
valuable|価値のある`],
  ["表現", `at least|少なくとも
by chance|偶然に
for example|例えば
in advance|前もって
in fact|実際には
on purpose|わざと
right away|すぐに
so far|これまでのところ
take part in|参加する
work out|うまくいく`],
]);

const japanese = wordsFromGroups([
  ["言葉の意味", `概念|物事をとらえるための考え方
定義|言葉の意味を明確に示すこと
語彙|使ったり理解したりできる言葉の集まり
文脈|言葉の意味を決める前後の流れ
比喩|別の物事にたとえて表す方法
象徴|ある意味や考えを代表して表すもの
主題|文章の中心となる話題
要旨|文章の最も大切な内容
根拠|判断を支える理由や事実
論点|議論で考えるべき中心の問題`],
  ["文章の構成", `序論|文章の初めに話題を示す部分
本論|理由や具体例を述べる中心部分
結論|文章の最後に考えをまとめる部分
段落|内容のまとまりごとに分けた部分
接続語|文と文の関係を示す言葉
対比|二つの物事の違いを比べること
因果|原因と結果のつながり
具体例|考えを分かりやすくする実例
引用|他者の言葉や文章を引いて用いること
推論|分かっていることから考えを導くこと`],
  ["読解", `視点|物事を見る立場や角度
筆者|文章を書いた人
語り手|物語を語る存在
登場人物|物語の中に出てくる人物
場面|物語の出来事が起こるひとまとまり
心情|心の中の気持ち
描写|様子や気持ちを言葉で表すこと
伏線|後の展開につながる手がかり
余韻|読み終えた後にも残る印象
解釈|言葉や出来事の意味を考えること`],
  ["表現技法", `直喩|「ようだ」などを使ってたとえる方法
隠喩|たとえだと明示せずに表す方法
擬人法|人でないものを人のように表す方法
反復|同じ言葉や形を繰り返すこと
倒置|通常と異なる語順にして強調する方法
体言止め|文を名詞で終えて印象を残す方法
対句|形の似た二つの表現を並べること
省略|分かる部分をあえて書かないこと
強調|大切な部分を目立たせること
婉曲|直接的な言い方を避けて表すこと`],
  ["思考", `分析|要素に分けて詳しく考えること
比較|二つ以上のものを比べること
分類|共通点によって分けること
仮説|確かめる前に立てた説明
検証|正しいかどうかを確かめること
批判|根拠をもとに吟味すること
発想|新しい考えを思いつくこと
着想|考えのきっかけを得ること
考察|資料をもとに深く考えること
判断|情報をもとに決めること`],
  ["感情", `安堵|心配がなくなりほっとすること
憧憬|あこがれる気持ち
懐疑|本当かどうか疑うこと
感慨|心に深く感じること
歓喜|大きな喜び
困惑|どうしたらよいか迷うこと
焦燥|いらだちと焦り
切望|強く願うこと
憤慨|不当なことに強く怒ること
郷愁|故郷や過去を懐かしむ気持ち`],
  ["社会", `公共|社会全体に関わること
共生|違いを認めながら共に生きること
権利|正当に認められた利益や自由
義務|果たすべき役割や責任
慣習|長く続いてきた社会の習わし
規範|行動のよりどころとなる基準
合意|話し合って意見が一致すること
多様性|さまざまな違いがあること
伝承|文化や知識を後に伝えること
変遷|時代とともに移り変わること`],
  ["自然", `季節|一年を気候の変化で分けた時期
気象|大気に起こる現象
景観|目に見える土地や自然の様子
生態|生物が環境の中で生きる様子
循環|めぐって元に戻ること
潮流|海水の流れ
地形|土地の形や起伏
風土|土地の気候や自然の特徴
豊穣|作物が豊かに実ること
余白|何も書かれていない空間`],
  ["ことわざ・慣用", `温故知新|昔を学び新しい知識を得ること
試行錯誤|試しながら方法を探すこと
十人十色|考えや好みは人によって異なること
一長一短|良い点と悪い点があること
以心伝心|言葉にしなくても気持ちが通じること
右往左往|慌ててあちこち動くこと
切磋琢磨|互いに励まし合って向上すること
臨機応変|状況に合わせて対応すること
自業自得|自分の行いの結果を自分で受けること
有言実行|言ったことを実際に行うこと`],
  ["学習", `暗記|覚えて記憶すること
復習|学んだことをもう一度確かめること
予習|授業の前に学んでおくこと
熟読|内容を考えながら丁寧に読むこと
要約|大事な点を短くまとめること
添削|文章を見直して直すこと
校正|文字や表記の誤りを正すこと
構想|全体の組み立てを考えること
推敲|表現をより良くするために練り直すこと
発表|考えや成果を人に伝えること`],
]);

const spanish = wordsFromGroups([
  ["あいさつ", `hola|こんにちは
adiós|さようなら
gracias|ありがとう
perdón|ごめんなさい
sí|はい
no|いいえ
buenos días|おはようございます
buenas tardes|こんにちは（午後）
buenas noches|こんばんは
hasta luego|また後で`],
  ["人", `yo|私
tú|あなた
él|彼
ella|彼女
nosotros|私たち
amigo|友人（男性）
amiga|友人（女性）
familia|家族
madre|母
padre|父`],
  ["場所", `casa|家
escuela|学校
ciudad|都市
pueblo|町
calle|通り
parque|公園
estación|駅
tienda|店
restaurante|レストラン
hospital|病院`],
  ["時間", `hoy|今日
mañana|明日
ayer|昨日
ahora|今
después|後で
antes|前に
día|日
noche|夜
semana|週
año|年`],
  ["食べ物", `agua|水
pan|パン
arroz|米
fruta|果物
manzana|りんご
verdura|野菜
carne|肉
pescado|魚
leche|牛乳
café|コーヒー`],
  ["自然", `sol|太陽
luna|月
mar|海
río|川
montaña|山
árbol|木
flor|花
lluvia|雨
viento|風
cielo|空`],
  ["基本動詞", `ser|〜である（性質）
estar|〜にいる・ある
tener|持っている
hacer|する・作る
ir|行く
venir|来る
ver|見る
oír|聞く
hablar|話す
comer|食べる`],
  ["行動", `beber|飲む
leer|読む
escribir|書く
aprender|学ぶ
enseñar|教える
trabajar|働く
comprar|買う
vender|売る
abrir|開ける
cerrar|閉める`],
  ["形容詞", `grande|大きい
pequeño|小さい
bueno|良い
malo|悪い
nuevo|新しい
viejo|古い
fácil|簡単な
difícil|難しい
rápido|速い
lento|遅い`],
  ["質問と表現", `¿qué?|何？
¿quién?|誰？
¿dónde?|どこ？
¿cuándo?|いつ？
¿por qué?|なぜ？
¿cómo?|どのように？
por favor|お願いします
de nada|どういたしまして
no entiendo|分かりません
mucho gusto|はじめまして`],
]);

const french = wordsFromGroups([
  ["あいさつ", `bonjour|こんにちは
bonsoir|こんばんは
salut|やあ
merci|ありがとう
au revoir|さようなら
s'il vous plaît|お願いします
pardon|すみません
oui|はい
non|いいえ
bienvenue|ようこそ`],
  ["旅先", `la gare|駅
l'aéroport|空港
le billet|切符
le train|電車
le bus|バス
la rue|通り
la ville|町
la carte|地図
la chambre|部屋
l'hôtel|ホテル`],
  ["食事", `l'eau|水
le café|コーヒー
le thé|お茶
le pain|パン
le fromage|チーズ
le menu|メニュー
le déjeuner|昼食
le dîner|夕食
la table|テーブル
l'addition|会計`],
  ["基本表現", `je suis|私は〜です
j'ai|私は持っています
je voudrais|〜をお願いします
où|どこ
quand|いつ
combien|いくら
aujourd'hui|今日
demain|明日
gauche|左
droite|右`],
]);

const chinese = wordsFromGroups([
  ["あいさつ", `你好|こんにちは
您好|こんにちは（丁寧）
早上好|おはようございます
晚上好|こんばんは
再见|さようなら
谢谢|ありがとう
不客气|どういたしまして
对不起|ごめんなさい
没关系|大丈夫です
请|どうぞ・お願いします`],
  ["人と場所", `我|私
你|あなた
他|彼
她|彼女
我们|私たち
朋友|友達
老师|先生
学生|学生
家|家
学校|学校`],
  ["日常", `今天|今日
明天|明日
现在|今
这里|ここ
那里|そこ・あそこ
什么|何
谁|誰
哪里|どこ
为什么|なぜ
怎么样|どうですか`],
  ["食事と買い物", `水|水
茶|お茶
米饭|ご飯
面条|麺
水果|果物
多少钱|いくら
买|買う
吃|食べる
喝|飲む
喜欢|好き`],
]);

const phrasalVerbs = wordsFromGroups([
  ["日常の句動詞", `wake up|目を覚ます
get up|起きる
sit down|座る
stand up|立ち上がる
come in|入ってくる
go out|外出する
come back|戻ってくる
go away|立ち去る
put on|身につける
take off|脱ぐ`],
  ["学習と仕事", `look up|調べる
write down|書き留める
hand in|提出する
find out|見つけ出す
carry out|実行する
work on|取り組む
go over|復習する
point out|指摘する
set up|設置する
fill in|記入する`],
  ["移動と変化", `get on|乗る
get off|降りる
pick up|拾う・迎えに行く
drop off|送り届ける
turn on|つける
turn off|消す
slow down|速度を落とす
grow up|成長する
move on|次に進む
run away|逃げる`],
  ["会話と関係", `call back|折り返し電話する
hang up|電話を切る
talk over|話し合う
ask for|求める
get along|仲良くやっていく
break up|別れる
look after|世話をする
cheer up|元気づける
join in|参加する
leave out|省く`],
]);

export const communitySamples = [
  {
    id: "sample-english", title: "毎日の英語 基本語", description: "日常・学校・社会でよく使う英語を、学習用にまとめました。", coverImage: "/community-english.png", creator: "ことば好き", subject: "英語", requiredPlan: "free" as const, community: true as const, wordCount: english.length, words: english,
  },
  {
    id: "sample-japanese", title: "読解に役立つ国語語彙", description: "読解や作文で使える語彙を、短い意味とともにまとめました。", coverImage: "/community-japanese.png", creator: "語彙を学ぶ人", subject: "国語", requiredPlan: "free" as const, community: true as const, wordCount: japanese.length, words: japanese,
  },
  {
    id: "sample-spanish", title: "はじめてのスペイン語", description: "あいさつから日常表現までを、日本語の意味と一緒に確認できます。", coverImage: "/community-languages.png", creator: "語学を楽しむ人", subject: "多言語", languageCode: "es-ES", requiredPlan: "free" as const, community: true as const, wordCount: spanish.length, words: spanish,
  },
  {
    id: "sample-french", title: "旅で使うフランス語", description: "あいさつ、移動、食事で役立つフランス語をまとめました。", coverImage: "/community-languages.png", creator: "旅する学習者", subject: "多言語", languageCode: "fr-FR", requiredPlan: "free" as const, community: true as const, wordCount: french.length, words: french,
  },
  {
    id: "sample-chinese", title: "中国語の日常フレーズ", description: "あいさつや買い物など、毎日の会話で使う中国語です。", coverImage: "/community-languages.png", creator: "ことばを集める人", subject: "多言語", languageCode: "zh-CN", requiredPlan: "free" as const, community: true as const, wordCount: chinese.length, words: chinese,
  },
  {
    id: "sample-phrasal-verbs", title: "日常で使う英語の句動詞", description: "生活、学習、会話でよく使う句動詞を場面別にまとめました。", coverImage: "/community-english.png", creator: "英語を学ぶ人", subject: "英語", languageCode: "en-US", requiredPlan: "free" as const, community: true as const, wordCount: phrasalVerbs.length, words: phrasalVerbs,
  },
];
