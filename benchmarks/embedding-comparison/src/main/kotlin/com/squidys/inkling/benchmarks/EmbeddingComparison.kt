package com.squidys.inkling.benchmarks

import ai.djl.huggingface.tokenizers.HuggingFaceTokenizer
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.EmbeddingEngine
import com.google.ai.edge.litertlm.EmbeddingEngineConfig
import com.google.ai.edge.litertlm.EmbeddingOptions
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.InputData
import com.google.ai.edge.litertlm.LogSeverity
import com.google.gson.GsonBuilder
import com.google.gson.JsonParser
import java.awt.BasicStroke
import java.awt.Color
import java.awt.Font
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.geom.RoundRectangle2D
import java.awt.image.BufferedImage
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.URI
import java.nio.LongBuffer
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.imageio.ImageIO
import org.apache.pdfbox.Loader
import org.apache.pdfbox.rendering.ImageType
import org.apache.pdfbox.rendering.PDFRenderer
import org.apache.pdfbox.text.PDFTextStripper
import oshi.SystemInfo
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.sqrt

private const val EMBEDDING_DIMENSIONS = 768
private const val MODEL_MANIFEST = "src-tauri/model-manifest.json"
private const val LITERT_VERSION = "0.18.0"
private const val ONNX_VERSION = "1.24.1"
private const val TOKENIZERS_VERSION = "0.36.0"

private val gemmaModel = mapOf(
    "id" to "embeddinggemma-2-text-vision-440m",
    "revision" to "e301f74d5551b0c2641bd5cb4652a76239d5c5f8",
    "filename" to "embeddinggemma-2-text-vision-440m.litertlm",
    "url" to "https://huggingface.co/litert-community/embeddinggemma-2-text-vision-440m-litert-lm/resolve/e301f74d5551b0c2641bd5cb4652a76239d5c5f8/embeddinggemma-2-text-vision-440m.litertlm",
    "sha256" to "92dcbea108899e5d6e30d919b0744f90d9967e80c67a4ab5503ac16d54f62eb0",
)

private data class Document(
    val id: String,
    val text: String,
    val images: List<Path>,
    val type: String,
)

private data class Query(
    val query: String,
    val relevant: List<String>,
    val group: String,
)

private data class SimilarityPair(
    val source: String,
    val relevant: List<String>,
)

private data class QueryData(
    val queries: List<Query>,
    val similarityPairs: List<SimilarityPair>,
)

private data class Arguments(
    val cacheDir: Path,
    val output: Path?,
    val threads: Int,
    val gemmaBackend: String,
)

private data class ModelVectors(
    val textVectors: Map<String, FloatArray>,
    val queryVectors: List<FloatArray>,
    val imageVectors: Map<Int, Map<String, List<FloatArray>>>,
    val pageVectors: Map<Int, Map<String, List<FloatArray>>>,
    val queryTimes: List<Double>,
    val textTimes: List<Double>,
    val imageTimes: Map<Int, List<Double>>,
    val pageTimes: Map<Int, List<Double>>,
    val loadMs: Map<String, Double>,
    val modelFileSizes: Map<String, Long>,
    val modelSize: Long,
    val modelId: String,
    val modelRevision: String,
    val backend: String,
    val rssLoadedMb: Double,
)

private data class RankResult(
    val id: String,
    val score: Double,
)

private data class QueryScore(
    val query: String,
    val group: String,
    val relevant: List<String>,
    val rank: Int?,
    val reciprocalRank: Double,
    val top5: List<Map<String, Any>>,
)

private data class TimedVector(
    val vector: FloatArray,
    val elapsedMs: Double,
)

private fun mainArguments(args: Array<String>): Arguments {
    var cacheDir = defaultCacheDir()
    var output: Path? = null
    var threads = Runtime.getRuntime().availableProcessors().coerceAtLeast(1)
    var backend = "cpu"
    var index = 0
    while (index < args.size) {
        when (val option = args[index]) {
            "--help", "-h" -> {
                println("Usage: gradlew run --args=\"[--cache-dir PATH] [--output PATH] [--threads N] [--gemma-backend cpu|gpu|npu]\"")
                kotlin.system.exitProcess(0)
            }
            "--cache-dir" -> cacheDir = Path.of(args.getOrNull(++index) ?: error("$option needs a path"))
            "--output" -> output = Path.of(args.getOrNull(++index) ?: error("$option needs a path"))
            "--threads" -> threads = args.getOrNull(++index)?.toIntOrNull() ?: error("$option needs an integer")
            "--gemma-backend" -> backend = args.getOrNull(++index) ?: error("$option needs cpu, gpu, or npu")
            else -> error("Unknown option: $option")
        }
        index++
    }
    require(threads > 0) { "--threads must be at least 1" }
    require(backend in setOf("cpu", "gpu", "npu")) { "--gemma-backend must be cpu, gpu, or npu" }
    return Arguments(cacheDir.toAbsolutePath().normalize(), output, threads, backend)
}

private fun defaultCacheDir(): Path {
    val windows = System.getProperty("os.name").lowercase().contains("win")
    val base = if (windows) {
        Path.of(System.getenv("LOCALAPPDATA") ?: Path.of(System.getProperty("user.home"), "AppData", "Local").toString())
    } else {
        Path.of(System.getenv("XDG_CACHE_HOME") ?: Path.of(System.getProperty("user.home"), ".cache").toString())
    }
    return base.resolve("inkling").resolve("embedding-comparison")
}

private fun findRepositoryRoot(): Path {
    var directory = Path.of("").toAbsolutePath().normalize()
    while (directory.parent != null) {
        if (Files.isRegularFile(directory.resolve("benchmarks/manifest.json"))) return directory
        directory = directory.parent
    }
    error("Run this benchmark from the Inkling repository or its subdirectory.")
}

private fun sha256(path: Path): String {
    val digest = MessageDigest.getInstance("SHA-256")
    Files.newInputStream(path).use { input ->
        val buffer = ByteArray(1024 * 1024)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            digest.update(buffer, 0, count)
        }
    }
    return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
}

private fun downloadAsset(path: Path, url: String, expectedSha256: String): Path {
    if (Files.isRegularFile(path) && sha256(path) == expectedSha256) return path

    Files.createDirectories(path.parent)
    val partial = path.resolveSibling(path.fileName.toString() + ".part")
    Files.deleteIfExists(partial)
    println("Downloading ${path.fileName} (public model artifact)")
    try {
        val connection = URI(url).toURL().openConnection().apply {
            connectTimeout = 60_000
            readTimeout = 60_000
        }
        val total = connection.contentLengthLong
        BufferedInputStream(connection.getInputStream()).use { input ->
            BufferedOutputStream(Files.newOutputStream(partial)).use { output ->
                val buffer = ByteArray(1024 * 1024)
                var received = 0L
                var lastReported = 0L
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    output.write(buffer, 0, count)
                    received += count
                    if (total > 0 && received - lastReported >= 32L * 1024 * 1024) {
                        println("  ${received * 100 / total}% downloaded")
                        lastReported = received
                    }
                }
            }
        }
        val actualSha256 = sha256(partial)
        check(actualSha256 == expectedSha256) {
            "SHA-256 verification failed for ${path.fileName}: expected $expectedSha256, got $actualSha256"
        }
        Files.move(partial, path, StandardCopyOption.REPLACE_EXISTING)
    } catch (error: Throwable) {
        Files.deleteIfExists(partial)
        throw error
    }
    return path
}

private fun expectedOcr(repoRoot: Path, itemId: String): String {
    val path = repoRoot.resolve("benchmarks/expected/ocr/$itemId.txt")
    return if (Files.isRegularFile(path)) Files.readString(path).trim() else ""
}

private fun renderPdf(path: Path, itemId: String, renderDir: Path): List<Path> {
    val digest = sha256(path).take(16)
    return Loader.loadPDF(path.toFile()).use { document ->
        val renderer = PDFRenderer(document)
        (0 until document.numberOfPages).map { index ->
            val imagePath = renderDir.resolve("$itemId-$digest-page-${(index + 1).toString().padStart(4, '0')}.png")
            if (!Files.isRegularFile(imagePath)) {
                Files.createDirectories(imagePath.parent)
                ImageIO.write(renderer.renderImage(index, 2.5f, ImageType.RGB), "png", imagePath.toFile())
            }
            imagePath
        }
    }
}

private fun readDocuments(repoRoot: Path, cacheDir: Path): Map<String, Document> {
    val manifest = JsonParser.parseString(Files.readString(repoRoot.resolve("benchmarks/manifest.json"))).asJsonObject
    val documents = linkedMapOf<String, Document>()
    val renderDir = cacheDir.resolve("rendered-pages")
    for (item in manifest.getAsJsonArray("items")) {
        val entry = item.asJsonObject
        val id = entry.get("id").asString
        val type = entry.get("type").asString
        val source = repoRoot.resolve("benchmarks").resolve(entry.get("path").asString)
        if (type == "pdf") {
            val extracted = Loader.loadPDF(source.toFile()).use { PDFTextStripper().getText(it).trim() }
            val text = extracted.ifEmpty { expectedOcr(repoRoot, id) }
            documents[id] = Document(id, text, renderPdf(source, id, renderDir), type)
        } else if (type == "image" || type == "screenshot") {
            documents[id] = Document(id, expectedOcr(repoRoot, id), listOf(source), type)
        }
    }
    documents.putAll(createVisualDocumentFixtures(cacheDir))
    check(documents.isNotEmpty()) { "No image, screenshot, or PDF fixtures were found." }
    return documents
}

private fun drawText(graphics: Graphics2D, text: String, x: Int, y: Int, font: Font, color: Color) {
    graphics.font = font
    graphics.color = color
    graphics.drawString(text, x, y + graphics.fontMetrics.ascent)
}

private fun createVisualDocumentFixtures(cacheDir: Path): Map<String, Document> {
    val fixtureDir = cacheDir.resolve("generated-visual-pages")
    Files.createDirectories(fixtureDir)
    val titleFont = Font(Font.SANS_SERIF, Font.BOLD, 50)
    val labelFont = Font(Font.SANS_SERIF, Font.PLAIN, 34)
    val ink = Color.decode("#302f2d")
    val paper = Color.decode("#faf8f3")
    val definitions = listOf(
        Triple("quarterly-chart", "Quarterly Revenue", "Quarterly revenue Q1 Q2 Q3 Q4") to ::drawChart,
        Triple("studio-plan", "Studio Plan", "Studio plan Kitchen Study Garden") to ::drawFloorPlan,
        Triple("transit-map", "City Transit Map", "City transit map Red Line Blue Line Central Museum") to ::drawTransitMap,
        Triple("capture-workflow", "Capture Workflow", "Capture workflow Capture OCR Embed Search") to ::drawWorkflow,
        Triple("temperature-map", "Room Temperature Map", "Room temperature map West East") to ::drawHeatmap,
        Triple("project-timeline", "Project Timeline", "Project timeline Plan Scan Index Search") to ::drawTimeline,
    )
    val documents = linkedMapOf<String, Document>()
    for ((definition, drawContent) in definitions) {
        val (slug, title, text) = definition
        for (variant in listOf("a", "b")) {
            val id = "visual-doc-$slug-$variant"
            val path = fixtureDir.resolve("$id.png")
            val image = BufferedImage(900, 1165, BufferedImage.TYPE_INT_RGB)
            val graphics = image.createGraphics()
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            graphics.color = paper
            graphics.fillRect(0, 0, image.width, image.height)
            drawText(graphics, title, 80, 100, titleFont, ink)
            drawContent(graphics, labelFont, variant == "b")
            graphics.dispose()
            ImageIO.write(image, "png", path.toFile())
            image.flush()
            documents[id] = Document(id, text, listOf(path), "pdf")
        }
    }
    for ((definition, _) in definitions) {
        val id = "visual-doc-${definition.first}"
        val first = documents.getValue("$id-a")
        val second = documents.getValue("$id-b")
        check(first.text == second.text)
        check(sha256(first.images.single()) != sha256(second.images.single()))
    }
    return documents
}

private fun drawChart(graphics: Graphics2D, font: Font, q4Highest: Boolean) {
    val ink = Color.decode("#494743")
    graphics.stroke = BasicStroke(6f)
    graphics.color = ink
    graphics.drawLine(150, 300, 150, 890)
    graphics.drawLine(150, 890, 790, 890)
    graphics.stroke = BasicStroke(2f)
    graphics.color = Color.decode("#d7d3cb")
    for (y in listOf(420, 540, 660, 780)) graphics.drawLine(150, y, 790, y)
    val heights = if (q4Highest) listOf(610, 500, 560, 340) else listOf(340, 500, 560, 610)
    val labels = listOf("Q1", "Q2", "Q3", "Q4")
    for (index in labels.indices) {
        val x = 220 + index * 140
        graphics.color = if ((labels[index] == "Q4") == q4Highest) Color.decode("#e77d49") else Color.decode("#648fbd")
        graphics.fill(RoundRectangle2D.Float(x.toFloat(), heights[index].toFloat(), 90f, (890 - heights[index]).toFloat(), 10f, 10f))
        drawText(graphics, labels[index], x + 26, 918, font, Color.decode("#302f2d"))
    }
}

private fun drawFloorPlan(graphics: Graphics2D, font: Font, gardenBelowStudy: Boolean) {
    data class Room(val x: Int, val y: Int, val width: Int, val height: Int, val name: String, val color: String)
    val rooms = if (gardenBelowStudy) listOf(
        Room(120, 300, 310, 300, "KITCHEN", "#dce8f0"), Room(470, 300, 310, 300, "STUDY", "#e4ecd9"), Room(120, 640, 660, 310, "GARDEN", "#f1e0cd"),
    ) else listOf(
        Room(120, 300, 310, 300, "KITCHEN", "#dce8f0"), Room(470, 300, 310, 300, "GARDEN", "#f1e0cd"), Room(120, 640, 660, 310, "STUDY", "#e4ecd9"),
    )
    for (room in rooms) {
        graphics.color = Color.decode(room.color)
        graphics.fillRect(room.x, room.y, room.width, room.height)
        drawText(graphics, room.name, room.x + 70, room.y + room.height / 2, font, Color.decode("#302f2d"))
    }
    graphics.color = Color.decode("#494743")
    graphics.stroke = BasicStroke(8f)
    graphics.drawLine(450, 280, 450, 620)
    graphics.drawLine(100, 620, 800, 620)
    graphics.drawRect(100, 280, 700, 690)
}

private fun drawTransitMap(graphics: Graphics2D, font: Font, linesCrossAtCentral: Boolean) {
    val paper = Color.decode("#faf8f3")
    graphics.stroke = BasicStroke(24f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
    graphics.color = Color.decode("#d94b45")
    graphics.drawLine(170, 480, 740, 480)
    val blueX = if (linesCrossAtCentral) 450 else 690
    graphics.color = Color.decode("#477fb4")
    graphics.drawLine(blueX, 260, blueX, 910)
    for (x in listOf(220, 450, 690)) {
        graphics.color = paper
        graphics.fillOval(x - 24, 456, 48, 48)
        graphics.color = Color.decode("#7f3432")
        graphics.stroke = BasicStroke(6f)
        graphics.drawOval(x - 24, 456, 48, 48)
    }
    for (y in listOf(330, 480, 820)) {
        graphics.color = paper
        graphics.fillOval(blueX - 24, y - 24, 48, 48)
        graphics.color = Color.decode("#315e86")
        graphics.stroke = BasicStroke(6f)
        graphics.drawOval(blueX - 24, y - 24, 48, 48)
    }
    for ((x, label) in listOf(450 to "CENTRAL", 690 to "MUSEUM")) {
        graphics.color = paper
        graphics.fillOval(x - 35, 445, 70, 70)
        graphics.color = Color.decode("#302f2d")
        graphics.stroke = BasicStroke(8f)
        graphics.drawOval(x - 35, 445, 70, 70)
        drawText(graphics, label, x - 45, 530, font, Color.decode("#302f2d"))
    }
}

private fun drawWorkflow(graphics: Graphics2D, font: Font, arrowsForward: Boolean) {
    val labels = listOf("CAPTURE", "OCR", "EMBED", "SEARCH")
    val fills = listOf("#dce8f0", "#eee5c9", "#e4ecd9", "#f1e0cd")
    val positions = listOf(80, 300, 520, 720)
    val boxFont = Font(Font.SANS_SERIF, Font.PLAIN, 28)
    for (index in labels.indices) {
        val x = positions[index]
        graphics.color = Color.decode(fills[index])
        graphics.fill(RoundRectangle2D.Float(x.toFloat(), 500f, 155f, 160f, 18f, 18f))
        graphics.color = Color.decode("#494743")
        graphics.stroke = BasicStroke(5f)
        graphics.draw(RoundRectangle2D.Float(x.toFloat(), 500f, 155f, 160f, 18f, 18f))
        drawText(graphics, labels[index], x + 18, 555, boxFont, Color.decode("#302f2d"))
    }
    for ((left, right) in listOf(235 to 300, 455 to 520, 675 to 720)) {
        val start = if (arrowsForward) left else right
        val end = if (arrowsForward) right else left
        graphics.color = Color.decode("#494743")
        graphics.stroke = BasicStroke(8f)
        graphics.drawLine(start, 580, end, 580)
        val direction = if (arrowsForward) 1 else -1
        graphics.fillPolygon(intArrayOf(end, end - direction * 20, end - direction * 20), intArrayOf(580, 566, 594), 3)
    }
}

private fun drawHeatmap(graphics: Graphics2D, font: Font, warmCellsOnEast: Boolean) {
    val original = listOf(
        listOf("#4a91b7", "#77adad", "#d97a54"),
        listOf("#347ea5", "#a7b49c", "#d95e4b"),
        listOf("#5ba0b3", "#d4bf81", "#e77d49"),
    )
    for (row in original.indices) for (column in original[row].indices) {
        val colorColumn = if (warmCellsOnEast) column else original[row].lastIndex - column
        val left = 170 + column * 190
        val top = 310 + row * 190
        graphics.color = Color.decode(original[row][colorColumn])
        graphics.fillRect(left, top, 170, 170)
        graphics.color = Color.decode("#faf8f3")
        graphics.stroke = BasicStroke(8f)
        graphics.drawRect(left, top, 170, 170)
    }
    drawText(graphics, "WEST", 175, 910, font, Color.decode("#302f2d"))
    drawText(graphics, "EAST", 650, 910, font, Color.decode("#302f2d"))
}

private fun drawTimeline(graphics: Graphics2D, font: Font, chronological: Boolean) {
    graphics.color = Color.decode("#77736c")
    graphics.stroke = BasicStroke(12f)
    graphics.drawLine(130, 620, 770, 620)
    val original = listOf("PLAN" to "#648fbd", "SCAN" to "#83b291", "INDEX" to "#9b8ac1", "SEARCH" to "#e77d49")
    val labels = if (chronological) original else original.reversed()
    for ((index, pair) in labels.withIndex()) {
        val x = 170 + index * 200
        graphics.color = Color.decode(pair.second)
        graphics.fillOval(x - 48, 572, 96, 96)
        graphics.color = Color.decode("#faf8f3")
        graphics.stroke = BasicStroke(6f)
        graphics.drawOval(x - 48, 572, 96, 96)
        drawText(graphics, pair.first, x - 48, 700, font, Color.decode("#302f2d"))
    }
}

private fun timed(block: () -> FloatArray): TimedVector {
    val started = System.nanoTime()
    val vector = block()
    return TimedVector(vector, (System.nanoTime() - started) / 1_000_000.0)
}

private fun unit(vector: FloatArray): FloatArray {
    require(vector.size == EMBEDDING_DIMENSIONS) {
        "Expected a $EMBEDDING_DIMENSIONS-dimensional embedding, got ${vector.size}."
    }
    val magnitude = sqrt(vector.sumOf { it.toDouble() * it.toDouble() }).toFloat()
    return if (magnitude == 0f) vector else FloatArray(vector.size) { vector[it] / magnitude }
}

private fun memoryMb(): Double {
    val processId = ProcessHandle.current().pid().toInt()
    val process = SystemInfo().operatingSystem.getProcess(processId)
    return process.residentSetSize / (1024.0 * 1024.0)
}

private fun buildNomicVectors(
    repoRoot: Path,
    documents: Map<String, Document>,
    queries: List<Query>,
    modelDir: Path,
    threads: Int,
): ModelVectors {
    val manifest = JsonParser.parseString(Files.readString(repoRoot.resolve(MODEL_MANIFEST))).asJsonObject
    val textModel = manifest.getAsJsonObject("text")
    val imageModel = manifest.getAsJsonObject("image")
    val textModelConfig = textModel.getAsJsonObject("model")
    val tokenizerConfig = textModel.getAsJsonObject("tokenizer")
    val imageModelConfig = imageModel.getAsJsonObject("model")
    val textPath = downloadAsset(
        modelDir.resolve(textModel.get("name").asString).resolve(textModelConfig.get("path").asString),
        textModelConfig.get("url").asString,
        textModelConfig.get("sha256").asString,
    )
    val tokenizerPath = downloadAsset(
        modelDir.resolve(textModel.get("name").asString).resolve(tokenizerConfig.get("path").asString),
        tokenizerConfig.get("url").asString,
        tokenizerConfig.get("sha256").asString,
    )
    val imagePath = downloadAsset(
        modelDir.resolve(imageModel.get("name").asString).resolve(imageModelConfig.get("path").asString),
        imageModelConfig.get("url").asString,
        imageModelConfig.get("sha256").asString,
    )

    val environment = OrtEnvironment.getEnvironment()
    fun createSession(path: Path): OrtSession = OrtSession.SessionOptions().use { options ->
        options.setExecutionMode(OrtSession.SessionOptions.ExecutionMode.SEQUENTIAL)
        options.setInterOpNumThreads(1)
        options.setIntraOpNumThreads(threads)
        environment.createSession(path.toString(), options)
    }
    val tokenizer = HuggingFaceTokenizer.builder()
        .optTokenizerPath(tokenizerPath)
        .optTruncation(true)
        .optMaxLength(8192)
        .optPadding(false)
        .build()
    val textStarted = System.nanoTime()
    val textSession = createSession(textPath)
    val textLoadMs = (System.nanoTime() - textStarted) / 1_000_000.0
    val imageStarted = System.nanoTime()
    val imageSession = createSession(imagePath)
    val imageLoadMs = (System.nanoTime() - imageStarted) / 1_000_000.0

    fun embedText(text: String, task: String): FloatArray {
        val encoding = tokenizer.encode("$task: $text")
        val ids = encoding.ids
        val typeIds = encoding.typeIds
        val attentionMask = encoding.attentionMask
        val feeds = linkedMapOf<String, OnnxTensor>()
        try {
            feeds["input_ids"] = OnnxTensor.createTensor(environment, LongBuffer.wrap(ids), longArrayOf(1, ids.size.toLong()))
            feeds["token_type_ids"] = OnnxTensor.createTensor(environment, LongBuffer.wrap(typeIds), longArrayOf(1, typeIds.size.toLong()))
            feeds["attention_mask"] = OnnxTensor.createTensor(environment, LongBuffer.wrap(attentionMask), longArrayOf(1, attentionMask.size.toLong()))
            textSession.run(feeds).use { result ->
                val output = result.get("last_hidden_state").get() as OnnxTensor
                val hidden = output.floatBuffer
                val mean = FloatArray(EMBEDDING_DIMENSIONS)
                var tokens = 0
                for (token in attentionMask.indices) {
                    if (attentionMask[token] == 0L) continue
                    tokens++
                    val offset = token * EMBEDDING_DIMENSIONS
                    for (dimension in mean.indices) mean[dimension] += hidden.get(offset + dimension)
                }
                check(tokens > 0) { "The tokenizer returned no active text tokens." }
                for (dimension in mean.indices) mean[dimension] /= tokens
                val average = mean.average().toFloat()
                val variance = mean.sumOf { ((it - average) * (it - average)).toDouble() }.toFloat() / EMBEDDING_DIMENSIONS
                val deviation = sqrt(variance + 1e-12f)
                for (dimension in mean.indices) mean[dimension] = (mean[dimension] - average) / deviation
                return unit(mean)
            }
        } finally {
            feeds.values.forEach { it.close() }
        }
    }

    fun embedImage(path: Path): FloatArray {
        val source = ImageIO.read(path.toFile()) ?: error("Could not read image: $path")
        val scale = max(224.0 / source.width, 224.0 / source.height)
        val width = ceil(source.width * scale).toInt()
        val height = ceil(source.height * scale).toInt()
        val scaled = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val graphics = scaled.createGraphics()
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
        graphics.drawImage(source, 0, 0, width, height, null)
        graphics.dispose()
        source.flush()
        val crop = scaled.getSubimage((width - 224) / 2, (height - 224) / 2, 224, 224)
        val mean = floatArrayOf(0.4814547f, 0.4578275f, 0.4082107f)
        val std = floatArrayOf(0.26862954f, 0.2613026f, 0.2757771f)
        val pixels = FloatArray(3 * 224 * 224)
        for (y in 0 until 224) for (x in 0 until 224) {
            val rgb = crop.getRGB(x, y)
            val pixel = y * 224 + x
            pixels[pixel] = (((rgb shr 16) and 0xff) / 255f - mean[0]) / std[0]
            pixels[224 * 224 + pixel] = (((rgb shr 8) and 0xff) / 255f - mean[1]) / std[1]
            pixels[2 * 224 * 224 + pixel] = ((rgb and 0xff) / 255f - mean[2]) / std[2]
        }
        scaled.flush()
        OnnxTensor.createTensor(environment, java.nio.FloatBuffer.wrap(pixels), longArrayOf(1, 3, 224, 224)).use { input ->
            imageSession.run(mapOf("pixel_values" to input)).use { result ->
                val hidden = (result.get("last_hidden_state").get() as OnnxTensor).floatBuffer
                return unit(FloatArray(EMBEDDING_DIMENSIONS) { hidden.get(it) })
            }
        }
    }

    val textVectors = linkedMapOf<String, FloatArray>()
    val textTimes = mutableListOf<Double>()
    val queryVectors = mutableListOf<FloatArray>()
    val queryTimes = mutableListOf<Double>()
    val imageVectors = linkedMapOf<Int, MutableMap<String, List<FloatArray>>>()
    val pageVectors = linkedMapOf<Int, MutableMap<String, List<FloatArray>>>()
    val imageTimes = mutableListOf<Double>()
    val pageTimes = mutableListOf<Double>()
    var rssLoadedMb = 0.0
    try {
        for ((id, document) in documents) {
            if (document.text.isNotBlank()) {
                val result = timed { embedText(document.text, "search_document") }
                textVectors[id] = result.vector
                textTimes.add(result.elapsedMs)
            }
        }
        for (query in queries) {
            val result = timed { embedText(query.query, "search_query") }
            queryVectors.add(result.vector)
            queryTimes.add(result.elapsedMs)
        }
        for ((id, document) in documents) {
            val vectors = mutableListOf<FloatArray>()
            for (path in document.images) {
                val result = timed { embedImage(path) }
                vectors.add(result.vector)
                (if (document.type == "pdf") pageTimes else imageTimes).add(result.elapsedMs)
            }
            if (document.type == "pdf") pageVectors.getOrPut(140) { linkedMapOf() }[id] = vectors
            else imageVectors.getOrPut(140) { linkedMapOf() }[id] = vectors
        }
        rssLoadedMb = memoryMb()
    } finally {
        textSession.close()
        imageSession.close()
        tokenizer.close()
    }
    val modelFiles = mapOf(
        "text_onnx" to Files.size(textPath),
        "tokenizer" to Files.size(tokenizerPath),
        "vision_onnx" to Files.size(imagePath),
    )
    val revisions = listOf(textModelConfig, imageModelConfig).map { it.get("url").asString.substringAfter("/resolve/").substringBefore("/") }
    return ModelVectors(
        textVectors,
        queryVectors,
        imageVectors.mapValues { it.value.toMap() },
        pageVectors.mapValues { it.value.toMap() },
        queryTimes,
        textTimes,
        mapOf(140 to imageTimes),
        mapOf(140 to pageTimes),
        mapOf("text_session" to textLoadMs, "image_session" to imageLoadMs),
        modelFiles,
        modelFiles.values.sum(),
        "${textModel.get("name").asString} + ${imageModel.get("name").asString}",
        revisions.joinToString("/"),
        "cpu",
        rssLoadedMb,
    )
}

private fun buildGemmaVectors(
    documents: Map<String, Document>,
    queries: List<Query>,
    modelDir: Path,
    backendName: String,
    threads: Int,
): ModelVectors {
    val modelPath = downloadAsset(
        modelDir.resolve(gemmaModel.getValue("id")).resolve(gemmaModel.getValue("filename")),
        gemmaModel.getValue("url"),
        gemmaModel.getValue("sha256"),
    )
    val backend = when (backendName) {
        "cpu" -> Backend.CPU(threadCount = threads)
        "gpu" -> Backend.GPU()
        else -> Backend.NPU()
    }
    val runtimeCache = modelDir.resolve("litert-runtime-cache")
    Files.createDirectories(runtimeCache)
    val engine = EmbeddingEngine(
        EmbeddingEngineConfig(
            modelPath = modelPath.toString(),
            backend = backend,
            visionBackend = backend,
            cacheDir = runtimeCache.toString(),
            maxInputLength = 8192,
            visionTokensPerImage = 140,
        ),
    )
    val loadStarted = System.nanoTime()
    engine.initialize()
    val engineLoadMs = (System.nanoTime() - loadStarted) / 1_000_000.0
    fun options(tokens: Int) = EmbeddingOptions(normalize = true, outputSize = EMBEDDING_DIMENSIONS, visionTokensPerImage = tokens)
    fun embedText(text: String, task: String): FloatArray = unit(
        engine.computeEmbedding(listOf(InputData.Text("task: $task | text: $text")), options(70)).embedding,
    )
    fun embedImage(path: Path, tokens: Int): FloatArray = unit(
        engine.computeEmbedding(listOf(InputData.Image(Files.readAllBytes(path))), options(tokens)).embedding,
    )
    val firstQuery = queries.firstOrNull()?.query ?: error("No benchmark queries are defined.")
    val firstImage = documents.values.firstOrNull { it.images.isNotEmpty() }?.images?.firstOrNull()
        ?: error("No benchmark images are available.")
    val firstText = timed { embedText(firstQuery, "search query") }
    val firstVisual = timed { embedImage(firstImage, 70) }
    val textVectors = linkedMapOf<String, FloatArray>()
    val textTimes = mutableListOf<Double>()
    val queryVectors = mutableListOf<FloatArray>()
    val queryTimes = mutableListOf<Double>()
    val imageVectors = linkedMapOf<Int, MutableMap<String, List<FloatArray>>>()
    val pageVectors = linkedMapOf<Int, MutableMap<String, List<FloatArray>>>()
    val imageTimes = linkedMapOf<Int, MutableList<Double>>()
    val pageTimes = linkedMapOf<Int, MutableList<Double>>()
    var rssLoadedMb = 0.0
    try {
        for ((id, document) in documents) {
            if (document.text.isNotBlank()) {
                val result = timed { embedText(document.text, "search result") }
                textVectors[id] = result.vector
                textTimes.add(result.elapsedMs)
            }
        }
        for (query in queries) {
            val result = timed { embedText(query.query, "search query") }
            queryVectors.add(result.vector)
            queryTimes.add(result.elapsedMs)
        }
        for ((id, document) in documents) {
            for (tokens in listOf(70, 140)) {
                val vectors = mutableListOf<FloatArray>()
                for (path in document.images) {
                    val result = timed { embedImage(path, tokens) }
                    vectors.add(result.vector)
                    (if (document.type == "pdf") pageTimes else imageTimes).getOrPut(tokens) { mutableListOf() }.add(result.elapsedMs)
                }
                (if (document.type == "pdf") pageVectors else imageVectors).getOrPut(tokens) { linkedMapOf() }[id] = vectors
            }
        }
        rssLoadedMb = memoryMb()
    } finally {
        engine.close()
    }
    return ModelVectors(
        textVectors,
        queryVectors,
        imageVectors.mapValues { it.value.toMap() },
        pageVectors.mapValues { it.value.toMap() },
        queryTimes,
        textTimes,
        imageTimes.mapValues { it.value.toList() },
        pageTimes.mapValues { it.value.toList() },
        mapOf("engine" to engineLoadMs, "first_text_embedding" to firstText.elapsedMs, "first_image_embedding" to firstVisual.elapsedMs),
        mapOf(gemmaModel.getValue("filename") to Files.size(modelPath)),
        Files.size(modelPath),
        gemmaModel.getValue("id"),
        gemmaModel.getValue("revision"),
        backendName,
        rssLoadedMb,
    )
}

private fun dot(left: FloatArray, right: FloatArray): Double {
    require(left.size == right.size)
    var sum = 0.0
    for (index in left.indices) sum += left[index].toDouble() * right[index]
    return sum
}

private fun rankDocuments(documents: Map<String, List<FloatArray>>, query: FloatArray): List<RankResult> =
    documents.mapNotNull { (id, views) ->
        views.maxOfOrNull { dot(query, it) }?.let { RankResult(id, it) }
    }.sortedWith(compareByDescending<RankResult> { it.score }.thenBy { it.id })

private fun scoreSearch(
    documents: Map<String, List<FloatArray>>,
    queryVectors: List<FloatArray>,
    queries: List<Query>,
): Map<String, Any> {
    val results = queries.mapIndexed { index, query ->
        val rankings = rankDocuments(documents, queryVectors[index])
        val ranks = rankings.mapIndexedNotNull { rankingIndex, result ->
            if (result.id in query.relevant) rankingIndex + 1 else null
        }
        val rank = ranks.minOrNull()
        QueryScore(
            query.query,
            query.group,
            query.relevant,
            rank,
            if (rank == null) 0.0 else 1.0 / rank,
            rankings.take(5).map { mapOf("id" to it.id, "score" to it.score) },
        )
    }
    fun metrics(rows: List<QueryScore>): Map<String, Any> = mapOf(
        "queries" to rows.size,
        "hit_at_1" to rows.count { it.rank == 1 }.toDouble() / rows.size,
        "hit_at_3" to rows.count { it.rank != null && it.rank <= 3 }.toDouble() / rows.size,
        "mrr" to rows.sumOf { it.reciprocalRank } / rows.size,
    )
    return mapOf(
        "overall" to metrics(results),
        "by_group" to results.groupBy { it.group }.toSortedMap().mapValues { metrics(it.value) },
        "query_results" to results,
    )
}

private fun imageSimilarity(vectors: Map<String, List<FloatArray>>, pairs: List<SimilarityPair>): Map<String, Any> {
    val itemVectors = vectors.filterKeys { it.startsWith("image-") }.mapValues { it.value.first() }
    val results = pairs.map { pair ->
        val source = itemVectors[pair.source] ?: error("Missing image vector: ${pair.source}")
        val ranked = itemVectors.filterKeys { it != pair.source }
            .map { RankResult(it.key, dot(source, it.value)) }
            .sortedWith(compareByDescending<RankResult> { it.score }.thenBy { it.id })
        val rank = ranked.indexOfFirst { it.id in pair.relevant }.takeIf { it >= 0 }?.plus(1)
        mapOf(
            "source" to pair.source,
            "relevant" to pair.relevant,
            "rank" to rank,
            "top3" to ranked.take(3).map { it.id },
        )
    }
    return mapOf(
        "queries" to results.size,
        "hit_at_1" to results.count { it["rank"] == 1 }.toDouble() / results.size,
        "mrr" to results.sumOf { (it["rank"] as? Int)?.let { rank -> 1.0 / rank } ?: 0.0 } / results.size,
        "query_results" to results,
    )
}

private fun timingSummary(samples: List<Double>): Map<String, Any?> {
    val sorted = samples.sorted()
    return mapOf(
        "count" to samples.size,
        "median_ms" to if (sorted.isEmpty()) null else if (sorted.size % 2 == 0) (sorted[sorted.size / 2 - 1] + sorted[sorted.size / 2]) / 2 else sorted[sorted.size / 2],
        "p90_ms" to if (sorted.isEmpty()) null else sorted[(ceil(sorted.size * 0.9).toInt() - 1).coerceAtLeast(0)],
        "total_ms" to samples.sum(),
    )
}

private fun combinedViews(
    documents: Map<String, Document>,
    textVectors: Map<String, FloatArray>,
    imageVectors: Map<String, List<FloatArray>>,
    pageVectors: Map<String, List<FloatArray>>,
    includePages: Boolean,
): Map<String, List<FloatArray>> = documents.mapValues { (id, document) ->
    buildList {
        textVectors[id]?.let(::add)
        if (document.type == "pdf") {
            if (includePages) addAll(pageVectors[id].orEmpty())
        } else addAll(imageVectors[id].orEmpty())
    }
}

private fun parseQueryData(path: Path): QueryData {
    val json = JsonParser.parseString(Files.readString(path)).asJsonObject
    val queries = json.getAsJsonArray("queries").map { item ->
        val query = item.asJsonObject
        Query(query.get("query").asString, query.getAsJsonArray("relevant").map { it.asString }, query.get("group").asString)
    }
    val pairs = json.getAsJsonArray("similarity_pairs").map { item ->
        val pair = item.asJsonObject
        SimilarityPair(pair.get("source").asString, pair.getAsJsonArray("relevant").map { it.asString })
    }
    return QueryData(queries, pairs)
}

fun main(args: Array<String>) {
    val options = mainArguments(args)
    Engine.setNativeMinLogSeverity(LogSeverity.ERROR)
    val repoRoot = findRepositoryRoot()
    val cacheDir = options.cacheDir
    val modelDir = cacheDir.resolve("models")
    val queryData = parseQueryData(repoRoot.resolve("benchmarks/embedding_comparison_queries.json"))
    val documents = readDocuments(repoRoot, cacheDir)
    val documentIds = documents.keys
    val missingLabels = queryData.queries.flatMap { it.relevant }.filterNot(documentIds::contains) +
        queryData.similarityPairs.flatMap { listOf(it.source) + it.relevant }.filterNot(documentIds::contains)
    check(missingLabels.isEmpty()) { "Benchmark labels refer to missing fixture IDs: ${missingLabels.distinct().sorted()}" }
    val pdfIds = documents.filterValues { it.type == "pdf" }.keys
    val textDocumentCount = documents.values.count { it.text.isNotBlank() }
    val visualInputs = documents.values.sumOf { it.images.size }
    val baselineMemory = memoryMb()
    println("Fixtures: ${documents.size} documents (${pdfIds.size} PDFs), ${queryData.queries.size} queries")
    println("Backend: Nomic ONNX CPU, EmbeddingGemma 2 ${options.gemmaBackend.uppercase()} (${options.threads} CPU threads)")
    println("Cache: $cacheDir")

    val nomic = buildNomicVectors(repoRoot, documents, queryData.queries, modelDir.resolve("nomic"), options.threads)
    val nomicMemoryMb = nomic.rssLoadedMb
    val gemma = buildGemmaVectors(documents, queryData.queries, modelDir.resolve("gemma"), options.gemmaBackend, options.threads)
    val gemmaMemoryMb = gemma.rssLoadedMb

    val nomicCurrent = combinedViews(documents, nomic.textVectors, nomic.imageVectors[140].orEmpty(), emptyMap(), false)
    val nomicWithPages = combinedViews(documents, nomic.textVectors, nomic.imageVectors[140].orEmpty(), nomic.pageVectors[140].orEmpty(), true)
    val gemmaText = combinedViews(documents, gemma.textVectors, emptyMap(), emptyMap(), false)
    val gemmaBySize = (70..140 step 70).associateWith { tokens ->
        combinedViews(documents, gemma.textVectors, gemma.imageVectors[tokens].orEmpty(), gemma.pageVectors[tokens].orEmpty(), true)
    }
    val retrieval = linkedMapOf(
        "nomic_current" to scoreSearch(nomicCurrent, nomic.queryVectors, queryData.queries),
        "nomic_with_pdf_pages" to scoreSearch(nomicWithPages, nomic.queryVectors, queryData.queries),
        "gemma_text_only" to scoreSearch(gemmaText, gemma.queryVectors, queryData.queries),
        "gemma_vision_70" to scoreSearch(gemmaBySize.getValue(70), gemma.queryVectors, queryData.queries),
        "gemma_vision_140" to scoreSearch(gemmaBySize.getValue(140), gemma.queryVectors, queryData.queries),
    )
    val similarity = mapOf(
        "nomic" to imageSimilarity(nomic.imageVectors[140].orEmpty(), queryData.similarityPairs),
        "gemma_70" to imageSimilarity(gemma.imageVectors[70].orEmpty(), queryData.similarityPairs),
        "gemma_140" to imageSimilarity(gemma.imageVectors[140].orEmpty(), queryData.similarityPairs),
    )
    val timings = linkedMapOf<String, Any>(
        "nomic_text_query" to timingSummary(nomic.queryTimes),
        "nomic_text_document" to timingSummary(nomic.textTimes),
        "nomic_image" to timingSummary(nomic.imageTimes[140].orEmpty()),
        "nomic_pdf_page_image" to timingSummary(nomic.pageTimes[140].orEmpty()),
        "nomic_current_index_total_ms" to (nomic.textTimes.sum() + nomic.imageTimes[140].orEmpty().sum()),
        "nomic_with_pdf_pages_index_total_ms" to (nomic.textTimes.sum() + nomic.imageTimes[140].orEmpty().sum() + nomic.pageTimes[140].orEmpty().sum()),
        "gemma_text_query" to timingSummary(gemma.queryTimes),
        "gemma_text_document" to timingSummary(gemma.textTimes),
        "gemma_image_70" to timingSummary(gemma.imageTimes[70].orEmpty() + gemma.pageTimes[70].orEmpty()),
        "gemma_image_140" to timingSummary(gemma.imageTimes[140].orEmpty() + gemma.pageTimes[140].orEmpty()),
        "gemma_70_index_total_ms" to (gemma.textTimes.sum() + gemma.imageTimes[70].orEmpty().sum() + gemma.pageTimes[70].orEmpty().sum()),
        "gemma_140_index_total_ms" to (gemma.textTimes.sum() + gemma.imageTimes[140].orEmpty().sum() + gemma.pageTimes[140].orEmpty().sum()),
    )
    val timestamp = Instant.now()
    val fileTimestamp = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(timestamp)
    val outputPath = (options.output ?: cacheDir.resolve("reports/embedding-comparison-$fileTimestamp.json")).toAbsolutePath().normalize()
    Files.createDirectories(outputPath.parent)
    val report: Map<String, Any> = linkedMapOf(
        "generated_at" to timestamp.toString(),
        "runtime" to mapOf(
            "platform" to "${System.getProperty("os.name")} ${System.getProperty("os.arch")}",
            "processor" to (System.getenv("PROCESSOR_IDENTIFIER") ?: System.getProperty("os.arch")),
            "java_version" to System.getProperty("java.version"),
            "cpu_count" to Runtime.getRuntime().availableProcessors(),
            "threads" to options.threads,
            "onnxruntime" to ONNX_VERSION,
            "litert_lm_jvm" to LITERT_VERSION,
            "tokenizers" to TOKENIZERS_VERSION,
            "litert_backend" to options.gemmaBackend,
            "litert_model_revision" to gemma.modelRevision,
            "rss_baseline_mb" to baselineMemory,
            "rss_nomic_loaded_mb" to nomicMemoryMb,
            "rss_gemma_loaded_mb" to gemmaMemoryMb,
        ),
        "corpus" to mapOf(
            "documents" to documents.size,
            "text_documents" to textDocumentCount,
            "visual_documents" to documents.values.count { it.images.isNotEmpty() },
            "visual_inputs_including_pdf_pages" to visualInputs,
            "pdfs" to pdfIds.size,
            "queries" to queryData.queries.size,
            "generated_fixtures_only" to true,
            "text_used" to "PDF text layer or committed OCR expectations; generated image OCR expectations",
        ),
        "models" to mapOf(
            "nomic" to mapOf(
                "id" to nomic.modelId,
                "model_files_bytes" to nomic.modelSize,
                "files" to nomic.modelFileSizes,
                "revisions" to nomic.modelRevision,
                "load_ms" to nomic.loadMs,
            ),
            "gemma" to mapOf(
                "id" to gemma.modelId,
                "revision" to gemma.modelRevision,
                "model_file_bytes" to gemma.modelSize,
                "backend" to gemma.backend,
                "load_ms" to gemma.loadMs,
                "vision_tokens_tested" to listOf(70, 140),
            ),
        ),
        "timings" to timings,
        "retrieval" to retrieval,
        "image_similarity" to similarity,
    )
    Files.writeString(outputPath, GsonBuilder().setPrettyPrinting().create().toJson(report))
    printResults(retrieval, timings, nomic.modelSize, gemma.modelSize, baselineMemory, nomicMemoryMb, gemmaMemoryMb, outputPath)
}

private fun printResults(
    retrieval: Map<String, Map<String, Any>>,
    timings: Map<String, Any>,
    nomicSize: Long,
    gemmaSize: Long,
    baselineMemory: Double,
    nomicMemory: Double,
    gemmaMemory: Double,
    outputPath: Path,
) {
    fun metrics(name: String, group: String): String {
        val result = retrieval.getValue(name)
        val values = if (group == "overall") result["overall"] else (result["by_group"] as Map<*, *>)[group]
        val metrics = values as? Map<*, *> ?: error("Missing $group retrieval metrics for $name")
        fun value(key: String) = (metrics[key] as? Number)?.toDouble() ?: error("Missing $key retrieval metric")
        return "${"%.2f".format(value("hit_at_1"))} / ${"%.2f".format(value("hit_at_3"))} / ${"%.2f".format(value("mrr"))}"
    }
    println("\nVector retrieval (hit@1 / hit@3 / MRR)")
    println("${"variant".padEnd(25)} ${"overall".padEnd(24)} ${"PDF text".padEnd(24)} ${"PDF visual".padEnd(24)} photos")
    for (name in retrieval.keys) {
        println("${name.padEnd(25)} ${metrics(name, "overall").padEnd(24)} ${metrics(name, "pdf-text").padEnd(24)} ${metrics(name, "pdf-visual").padEnd(24)} ${metrics(name, "photo")}")
    }
    println("\nMedian inference latency")
    for (name in listOf("nomic_text_query", "gemma_text_query", "nomic_image", "gemma_image_70", "gemma_image_140")) {
        val summary = timings.getValue(name) as? Map<*, *> ?: error("Missing $name timing summary")
        val median = (summary["median_ms"] as? Number)?.toDouble() ?: error("Missing median latency for $name")
        val p90 = (summary["p90_ms"] as? Number)?.toDouble() ?: error("Missing p90 latency for $name")
        println("${name.padEnd(24)} ${"%.1f".format(median)} ms (p90 ${"%.1f".format(p90)} ms)")
    }
    println("\nModel files: Nomic ${"%.1f".format(nomicSize / 1e6)} MB; Gemma ${"%.1f".format(gemmaSize / 1e6)} MB")
    println("Memory RSS: baseline ${"%.0f".format(baselineMemory)} MB, Nomic loaded ${"%.0f".format(nomicMemory)} MB, Gemma loaded ${"%.0f".format(gemmaMemory)} MB")
    println("\nReport: $outputPath")
}
