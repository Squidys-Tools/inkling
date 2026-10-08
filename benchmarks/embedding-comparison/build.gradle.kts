plugins {
    kotlin("jvm") version "2.4.0"
    application
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    implementation("com.google.ai.edge.litertlm:litertlm-jvm:0.18.0")
    implementation("com.microsoft.onnxruntime:onnxruntime:1.24.1")
    implementation("ai.djl.huggingface:tokenizers:0.36.0")
    implementation("org.apache.pdfbox:pdfbox:3.0.6")
    implementation("com.google.code.gson:gson:2.13.2")
    implementation("com.github.oshi:oshi-core:6.9.0")
}

kotlin {
    jvmToolchain(21)
}

application {
    mainClass.set("com.squidys.inkling.benchmarks.EmbeddingComparisonKt")
}

tasks.named<JavaExec>("run") {
    workingDir = rootProject.projectDir.parentFile.parentFile
    jvmArgs("-Djava.awt.headless=true")
}
