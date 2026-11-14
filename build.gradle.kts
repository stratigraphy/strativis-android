plugins {
    id("com.android.application") version "9.5.1" apply false
    // Newer Kotlin Gradle plugin than the one bundled with the Android plugin:
    // the bundled one uses Gradle APIs that are deprecated for Gradle 10/11.
    id("org.jetbrains.kotlin.android") version "2.4.21" apply false
}
