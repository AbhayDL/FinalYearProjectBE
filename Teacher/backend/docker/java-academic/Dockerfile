FROM eclipse-temurin:17-jdk-jammy

RUN apt-get update \
  && apt-get install -y --no-install-recommends wget ca-certificates \
  && mkdir -p /opt/java-libs \
  && wget -q -O /opt/java-libs/gson.jar https://repo1.maven.org/maven2/com/google/code/gson/gson/2.11.0/gson-2.11.0.jar \
  && wget -q -O /opt/java-libs/commons-lang3.jar https://repo1.maven.org/maven2/org/apache/commons/commons-lang3/3.17.0/commons-lang3-3.17.0.jar \
  && wget -q -O /opt/java-libs/commons-math3.jar https://repo1.maven.org/maven2/org/apache/commons/commons-math3/3.6.1/commons-math3-3.6.1.jar \
  && wget -q -O /opt/java-libs/jsoup.jar https://repo1.maven.org/maven2/org/jsoup/jsoup/1.18.3/jsoup-1.18.3.jar \
  && wget -q -O /opt/java-libs/opencsv.jar https://repo1.maven.org/maven2/com/opencsv/opencsv/5.10/opencsv-5.10.jar \
  && wget -q -O /opt/java-libs/jfreechart.jar https://repo1.maven.org/maven2/org/jfree/jfreechart/1.5.5/jfreechart-1.5.5.jar \
  && apt-get purge -y --auto-remove wget \
  && rm -rf /var/lib/apt/lists/*
